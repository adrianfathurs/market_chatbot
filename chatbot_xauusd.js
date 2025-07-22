require("dotenv").config();
const axios = require("axios");
const { RSI, SMA, MACD, ATR } = require("technicalindicators");
const { generateChart, sendImageToTelegram } = require("./utils/chartutils");

// === Konfigurasi Telegram ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// === Konfigurasi Twelve Data API ===
const API_KEY = process.env.TWELVE_DATA_API_KEY;

// === Fungsi Kirim Pesan Telegram ===
async function sendTelegram(msg) {
  try {
    await axios.post(TELEGRAM_URL, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "Markdown",
    });
    console.log("✅ Sinyal terkirim ke Telegram!");
  } catch (err) {
    console.error("❌ Gagal kirim:", err.message);
  }
}

// === Ambil Data Harga XAU/USD ===
async function fetchXAUUSD() {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=15min&outputsize=200&apikey=${API_KEY}`;
    const res = await axios.get(url);
    const data = res.data.values;
    return data.reverse().map((d) => ({
      close: parseFloat(d.close),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
    }));
  } catch (error) {
    console.log(error);
  }
}

// === Analisis dan Kirim Sinyal ===
async function checkSignal() {
  try {
    const candles = await fetchXAUUSD();
    if (!candles || candles.length < 200) return;

    const closes = candles.map((d) => d.close);
    const highs = candles.map((d) => d.high);
    const lows = candles.map((d) => d.low);
    const currentPrice = closes.at(-1);

    // === Indikator teknikal ===
    const rsi = RSI.calculate({ period: 14, values: closes });
    const ma5 = SMA.calculate({ period: 5, values: closes });
    const ma20 = SMA.calculate({ period: 20, values: closes });
    const ma50 = SMA.calculate({ period: 50, values: closes });
    const ma100 = SMA.calculate({ period: 100, values: closes });
    const ma200 = SMA.calculate({ period: 200, values: closes });

    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    // === Ambil nilai terbaru ===
    const r = rsi.at(-1);
    const m5 = ma5.at(-1);
    const m20 = ma20.at(-1);
    const m50 = ma50.at(-1);
    const m100 = ma100.at(-1);
    const m200 = ma200.at(-1);

    const latestMACD = macdResult.at(-1);
    const prevMACD = macdResult.at(-2);
    const macdValue = latestMACD?.MACD ?? 0;
    const signalValue = latestMACD?.signal ?? 0;

    const latestATR = atr.at(-1);
    if (!latestATR || !latestMACD || !prevMACD) return;

    const atrPercent = (latestATR / currentPrice) * 100;
    const isATRValid = atrPercent >= 0.3; // Sesuaikan threshold di sini

    const isMarketStrong = isATRValid;

    // === Logika sinyal utama ===
    const isRSIValid = r >= 25 && r <= 65;
    const isMABuyValid = m5 > m20 && m20 > m50 && m50 > m100 && m100 > m200;
    const isMASellValid = m5 < m20 && m20 < m50 && m50 < m100;

    const isMACDCrossUp =
      macdValue > signalValue && prevMACD?.MACD < prevMACD?.signal;
    const isMACDCrossDown =
      macdValue < signalValue && prevMACD?.MACD > prevMACD?.signal;

    // === Logging ke console ===
    console.log(
      `[XAUUSD][${new Date().toLocaleTimeString()}] RSI: ${r.toFixed(
        2
      )} | MA Bull: ${isMABuyValid} | MACD: ${macdValue.toFixed(
        4
      )} > ${signalValue.toFixed(4)} | MACD confirm: ${isMACDCrossUp} | ATR: ${latestATR.toFixed(2)} | BUY: ${
        isRSIValid && isMABuyValid && isMACDCrossUp
      }`
    );

    // === Sinyal BUY ===
    if (isRSIValid && isMABuyValid && isMACDCrossUp) {
      const TP1 = (currentPrice + latestATR * 1.0).toFixed(2);
      const TP2 = (currentPrice + latestATR * 1.5).toFixed(2);
      const TP3 = (currentPrice + latestATR * 2.0).toFixed(2);
      const lowerBuy = (currentPrice - latestATR * 1.0).toFixed(2);
      const upperBuy = (currentPrice - latestATR * 0.5).toFixed(2);
      const SL = (currentPrice - latestATR * 1.5).toFixed(2);
      const rangeBuy = `${lowerBuy} - ${upperBuy}`;

      await sendTelegram(
        `🚨 *SINYAL BUY CONFIRM: XAUUSD [TF15]*\n\n` +
          `*RSI:* ${r.toFixed(2)} ✅\n` +
          `*MA:* Tersusun bullish ✅\n` +
          `*MACD:* ${macdValue.toFixed(4)} > ${signalValue.toFixed(
            4
          )} (Cross Up ✅)\n` +
          `*ATR:* ${latestATR.toFixed(2)} ✅\n` +
          `📍 *Buy Area:* ${rangeBuy}\n` +
          `🎯 *TP1:* ${TP1}\n🎯 *TP2:* ${TP2}\n🎯 *TP3:* ${TP3}\n` +
          `🛡️ *SL:* ${SL}`
      );

      const chartPath = await generateChart(closes);
      const caption = `📈 *Sinyal BUY - XAUUSD*\nRSI: ${r.toFixed(
        2
      )} | MACD Cross Up ✅`;
      await sendImageToTelegram(chartPath, caption, BOT_TOKEN, CHAT_ID);
    }

    // === Sinyal SELL ===
    if (isMASellValid && isMACDCrossDown) {
      await sendTelegram(
        `🚨 *SINYAL BEARISH CONFIRM: XAUUSD [TF15]*\n\n` +
          `*RSI:* ${r.toFixed(2)}\n` +
          `*MA:* Tersusun bearish ✅\n` +
          `*MACD:* ${macdValue.toFixed(4)} < ${signalValue.toFixed(
            4
          )} (Cross Down ❌)\n\n` +
          `🚫 Hindari entry buy saat ini.`
      );
    }
  } catch (error) {
    console.log(error);
  }
}

// === Eksekusi Tiap 15 Menit ===
function waitUntilNextQuarterHour() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const msToNextQuarter =
    ((15 - (minutes % 15)) % 15) * 60 * 1000 - seconds * 1000;

  console.log(
    `XAUUSD: Menunggu ${Math.ceil(
      msToNextQuarter / 1000
    )} detik hingga kuartal berikutnya...`
  );

  setTimeout(() => {
    checkSignal();
    setInterval(checkSignal, 15 * 60 * 1000);
  }, msToNextQuarter);
}

// === Mulai Bot ===
waitUntilNextQuarterHour();
