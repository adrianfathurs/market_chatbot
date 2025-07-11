require("dotenv").config();
const axios = require("axios");
const { RSI, SMA } = require("technicalindicators");

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
      parse_mode: "Markdown"
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
  const prices = data.reverse().map(d => parseFloat(d.close)); // dari lama ke baru
  return prices;
}

// === Cek Sinyal BUY ===
async function checkSignal() {
  const prices = await fetchBTCUSD();
  if (prices.length < 200) return;

  const rsi = RSI.calculate({ period: 14, values: prices });
  const ma5 = SMA.calculate({ period: 5, values: prices });
  const ma20 = SMA.calculate({ period: 20, values: prices });
  const ma50 = SMA.calculate({ period: 50, values: prices });
  const ma100 = SMA.calculate({ period: 100, values: prices });
  const ma200 = SMA.calculate({ period: 200, values: prices });

  const r = rsi.at(-1);
  const m5 = ma5.at(-1);
  const m20 = ma20.at(-1);
  const m50 = ma50.at(-1);
  const m100 = ma100.at(-1);
  const m200 = ma200.at(-1);

  const isRSIValid = r >= 30 && r <= 65;
  const isMAValid = m5 > m20 && m20 > m50 && m50 > m100 && m100 > m200;

  console.log(`[BTCUSD][${new Date().toLocaleTimeString()}] RSI: ${r.toFixed(2)} | BUY: ${isRSIValid && isMAValid}`);

  if (isRSIValid && isMAValid) {
    await sendTelegram(
      `🚨 *SINYAL BUY CONFIRM: BTCUSD [TF15]*\n\n*RSI:* ${r.toFixed(2)}\n*MA:* Tersusun bullish\n📈 Aksi: BUY Sekarang di harga: ${prices}\n TP1: ${prices + 5}\n TP2: ${prices + 10}\n TP3: ${prices + 20}\n`
    );
  }
}

function waitUntilNextQuarterHour() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const msToNextQuarter =
    ((15 - (minutes % 15)) % 15) * 60 * 1000 - seconds * 1000;

  console.log(`BTCUSD: Waiting ${msToNextQuarter / 1000} seconds to next quarter hour...`);

  setTimeout(() => {
    checkSignal();
    setInterval(checkSignal, 15 * 60 * 1000); // 15 menit
  }, msToNextQuarter);
}

// === Jalan setiap 15 menit ===
// NOTE: Gunakan cron atau biarkan running terus tiap menit (untuk deteksi cepat sinyal baru)
waitUntilNextQuarterHour();
