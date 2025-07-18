require("dotenv").config();
const axios = require("axios");
const { RSI, SMA, ATR } = require("technicalindicators");

// === Konfigurasi Telegram ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// === Konfigurasi Twelve Data API ===
const API_KEY = "b71e4be90bdc431c8c31b059711f3976";

// === Fungsi Kirim Telegram ===
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

// === Ambil data harga TF 15 Menit ===
async function fetchBTCUSD() {
  const url = `https://api.twelvedata.com/time_series?symbol=BTC/USD&interval=15min&outputsize=200&apikey=${API_KEY}`;
  const res = await axios.get(url);
  const data = res.data.values;

  if (!data || !Array.isArray(data)) throw new Error("Data kosong atau error dari API");

  const reversed = data.reverse(); // dari lama ke baru

  const closes = reversed.map(d => parseFloat(d.close));
  const highs = reversed.map(d => parseFloat(d.high));
  const lows = reversed.map(d => parseFloat(d.low));

  return { closes, highs, lows };
}

// === Cek Sinyal BUY ===
async function checkSignal() {
  try {
    const { closes, highs, lows } = await fetchBTCUSD();

    if (closes.length < 200) return;

    const rsi = RSI.calculate({ period: 14, values: closes });
    const ma5 = SMA.calculate({ period: 5, values: closes });
    const ma20 = SMA.calculate({ period: 20, values: closes });
    const ma50 = SMA.calculate({ period: 50, values: closes });
    const ma100 = SMA.calculate({ period: 100, values: closes });
    const ma200 = SMA.calculate({ period: 200, values: closes });

    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    const currentPrice = closes.at(-1);
    const latestATR = atr.at(-1);

    if (!latestATR) {
      console.warn("ATR tidak tersedia");
      return;
    }

    const r = rsi.at(-1);
    const m5 = ma5.at(-1);
    const m20 = ma20.at(-1);
    const m50 = ma50.at(-1);
    const m100 = ma100.at(-1);
    const m200 = ma200.at(-1);

    // === Validasi Sinyal ===
    const isRSIValid = r >= 30 && r <= 65;
    const isMAValid = m5 > m20 && m20 > m50 && m50 > m100 && m100 > m200;
    const atrPercent = (latestATR / currentPrice) * 100;
    const isATRValid = atrPercent >= 0.2 && atrPercent <= 0.5; // ATR threshold (bisa disesuaikan)

    const isSignalValid = isRSIValid && isMAValid && isATRValid;

    console.log(`[${new Date().toLocaleTimeString()}] RSI: ${r.toFixed(2)} | ATR%: ${atrPercent.toFixed(2)} | Signal: ${isSignalValid ? "✅" : "❌"}`);

    if (isSignalValid) {
      const tp1 = (currentPrice + latestATR * 1).toFixed(2);
      const tp2 = (currentPrice + latestATR * 1.5).toFixed(2);
      const tp3 = (currentPrice + latestATR * 2).toFixed(2);

      await sendTelegram(
        `🚨 *SINYAL BUY CONFIRM: BTCUSD [TF15]*\n\n` +
        `*📈 Harga Saat Ini:* $${currentPrice}\n` +
        `*📊 RSI:* ${r.toFixed(2)}\n` +
        `*🧠 MA Valid:* ${isMAValid ? "Ya" : "Tidak"}\n` +
        `*📶 ATR:* ${latestATR.toFixed(2)} (${atrPercent.toFixed(2)}%)\n\n` +
        `🎯 *Target Profit:*\n` +
        `• TP1: $${tp1}\n` +
        `• TP2: $${tp2}\n` +
        `• TP3: $${tp3}\n\n` +
        `🕒 Time: ${new Date().toLocaleTimeString()}`
      );
    }
  } catch (error) {
    console.error("❌ ERROR:", error.message);
  }
}

function waitUntilNextQuarterHour() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const msToNextQuarter =
    ((15 - (minutes % 15)) % 15) * 60 * 1000 - seconds * 1000;

  console.log(`⏳ Menunggu ${msToNextQuarter / 1000} detik ke 15 menit berikutnya...`);

  setTimeout(() => {
    checkSignal();
    setInterval(checkSignal, 15 * 60 * 1000); // tiap 15 menit
  }, msToNextQuarter);
}

// === Mulai Bot ===
waitUntilNextQuarterHour();
