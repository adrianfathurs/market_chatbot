require("dotenv").config();
const axios = require("axios");
const { RSI, SMA, MACD, ATR } = require("technicalindicators");
const { generateChart, sendImageToTelegram } = require("./utils/chartutils");

// === Konfigurasi Telegram ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// === Konfigurasi Finnhub ===
const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1";

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

// === Ambil Data Candle XAU/USD dari Finnhub ===
async function fetchXAUUSD() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 60 * 60 * 24 * 7; // 7 hari ke belakang cukup untuk indikator
    const url = `${BASE_URL}/forex/candle?symbol=OANDA:XAU_USD&resolution=15&from=${from}&to=${now}&token=${API_KEY}`;
    console.log("fetchXAUUSD url:", url);
    const res = await axios.get(url);

    if (!res.data || res.data.s !== "ok") {
      console.warn("fetchXAUUSD: respons API tidak valid:", res.data);
      return null;
    }

    // mapping ke format candle
    return res.data.c.map((close, i) => ({
      time: res.data.t[i] * 1000, // unix ts ms
      close: close,
      high: res.data.h[i],
      low: res.data.l[i],
    }));
  } catch (error) {
    console.error("fetchXAUUSD error:", error.message || error);
    return null;
  }
}

// === Analisis dan Kirim Sinyal ===
async function checkSignal() {
  try {
    const candles = await fetchXAUUSD();
    if (!candles || candles.length < 250) {
      console.warn("Data candles kurang untuk analisis (butuh >=250).");
      return;
    }

    const closes = candles.map((d) => d.close);
    const highs = candles.map((d) => d.high);
    const lows = candles.map((d) => d.low);
    const currentPrice = closes.at(-1);

    // indikator teknikal
    const rsi = RSI.calculate({ period: 14, values: closes });
    const ma20 = SMA.calculate({ period: 20, values: closes });
    const ma50 = SMA.calculate({ period: 50, values: closes });
    const macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

    if (!rsi.length || !ma20.length || !ma50.length || !macd.length || !atr.length) {
      console.warn("Indikator belum siap, data tidak cukup.");
      return;
    }

    const latestRSI = rsi.at(-1);
    const latestMA20 = ma20.at(-1);
    const latestMA50 = ma50.at(-1);
    const latestMACD = macd.at(-1);
    const prevMACD = macd.at(-2);
    const latestATR = atr.at(-1);

    const macdCrossUp = latestMACD.MACD > latestMACD.signal && prevMACD.MACD <= prevMACD.signal;
    const macdCrossDown = latestMACD.MACD < latestMACD.signal && prevMACD.MACD >= prevMACD.signal;

    console.log(`[XAUUSD] Price: ${currentPrice} | RSI: ${latestRSI} | MACD crossUp:${macdCrossUp}`);

    // === Sinyal BUY ===
    if (latestRSI > 30 && latestRSI < 70 && latestMA20 > latestMA50 && macdCrossUp) {
      const TP1 = (currentPrice + latestATR * 1).toFixed(2);
      const SL = (currentPrice - latestATR * 1.5).toFixed(2);

      await sendTelegram(
        `🚨 *BUY Signal - XAUUSD [TF15]*\n\n` +
          `*Harga:* ${currentPrice}\n` +
          `*RSI:* ${latestRSI.toFixed(2)} ✅\n` +
          `*MA:* MA20 > MA50 ✅\n` +
          `*MACD:* Cross Up ✅\n` +
          `🎯 *TP1:* ${TP1}\n` +
          `🛡️ *SL:* ${SL}`
      );

      try {
        const chartPath = await generateChart(closes);
        await sendImageToTelegram(chartPath, "📈 BUY - XAUUSD", BOT_TOKEN, CHAT_ID);
      } catch (err) {
        console.warn("Chart gagal:", err.message);
      }
    }

    // === Sinyal SELL ===
    if (latestRSI < 70 && latestMA20 < latestMA50 && macdCrossDown) {
      await sendTelegram(
        `🚨 *SELL Signal - XAUUSD [TF15]*\n\n` +
          `*Harga:* ${currentPrice}\n` +
          `*RSI:* ${latestRSI.toFixed(2)}\n` +
          `*MA:* MA20 < MA50 ✅\n` +
          `*MACD:* Cross Down ✅`
      );
    }
  } catch (error) {
    console.error("checkSignal error:", error.message || error);
  }
}

// === Eksekusi tiap 15 menit ===
function waitUntilNextQuarterHour() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = ((15 - (minutes % 15)) % 15) * 60 * 1000 - seconds * 1000;

  console.log(`Menunggu ${Math.ceil(ms / 1000)} detik ke kuartal berikutnya...`);
  setTimeout(() => {
    checkSignal();
    setInterval(() => checkSignal(), 15 * 60 * 1000);
  }, ms);
}

waitUntilNextQuarterHour();
