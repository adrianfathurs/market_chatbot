require("dotenv").config();
const moment = require("moment-timezone");
require("moment/locale/id"); // opsional, kalau mau format bahasa Indonesia

const axios = require("axios");

// === Konfigurasi TradingEconomics ===
const API_KEY = process.env.TRADING_ECONOMICS_API_KEY;
console.log("API KEY:", process.env.TRADING_ECONOMICS_API_KEY);
const BASE_URL = "https://api.tradingeconomics.com";

// === Konfigurasi Telegram ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// === Fungsi kirim ke Telegram ===
async function sendTelegram(msg) {
  try {
    await axios.post(TELEGRAM_URL, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "Markdown",
    });
    console.log("✅ Terkirim ke Telegram!");
  } catch (err) {
    console.error("❌ Gagal kirim:", err.message);
  }
}

// === Fungsi ambil event dari TradingEconomics ===
async function getEvents(from, to) {
  const url = `${BASE_URL}/calendar?c=${API_KEY}&f=json&from=${from}&to=${to}`;
  try {
    const res = await axios.get(url);
    return res.data.map(ev => ({
      country: ev.Country,
      event: ev.Event,
      importance: ev.Importance,
      date: ev.Date,
      actual: ev.Actual,
      forecast: ev.Forecast,
      previous: ev.Previous,
    }));
  } catch (err) {
    console.error("❌ Error fetch calendar:", err.message);
    return [];
  }
}

// === Interpretasi event berdasarkan Actual vs Forecast ===
// === FUNGSI INTERPRETASI ===
function interpretEvent(event) {
  if (!event.actual || !event.forecast) return "Netral";

  const actual = parseFloat(event.actual);
  const forecast = parseFloat(event.forecast);
  if (isNaN(actual) || isNaN(forecast)) return "Netral";

  const diff = ((actual - forecast) / forecast) * 100; // selisih %

  let strength = "Lemah => 30 pip";
  if (Math.abs(diff) > 1) strength = "Kuat => 150 pip";
  else if (Math.abs(diff) > 0.3) strength = "Sedang => 70 pip";

  const isBearishForGold =
    event.event.includes("CPI") || event.event.includes("Employment");

  if (actual > forecast) {
    return isBearishForGold
      ? `Bearish Emas (${strength})`
      : `Bullish Emas (${strength})`;
  } else if (actual < forecast) {
    return isBearishForGold
      ? `Bullish Emas (${strength})`
      : `Bearish Emas (${strength})`;
  } else {
    return "Netral";
  }
}

// === Reminder event besok (jam 21:00 WIB) ===
async function sendTomorrowReminder() {
  const today = moment().tz("Asia/Jakarta");
  const tomorrow = today.clone().add(1, "day").format("YYYY-MM-DD");

  const events = await getEvents(tomorrow, tomorrow);
  if (!events.length) {
    await sendTelegram("📅 Tidak ada event ekonomi terdeteksi untuk besok.");
    return;
  }

  let message = `📅 *Event Ekonomi Esok Hari*\n\n`;
  events.slice(0, 10).forEach(ev => {
    const time = moment(ev.date).tz("Asia/Jakarta").format("DD MMM YYYY HH:mm");
    message += `- [${ev.country}] *${ev.event}* (${ev.importance})\n🕒 ${time}\n\n`;
  });

  await sendTelegram(message);
}

// === Watcher event hari ini ===
let sentEvents = new Set(); // biar gak kirim ulang
async function watchTodayEvents() {
  const today = moment().tz("Asia/Jakarta").format("YYYY-MM-DD");
  const events = await getEvents(today, today);

  for (const ev of events) {
    if (ev.actual !== null && !sentEvents.has(ev.event)) {
      const time = moment(ev.date).tz("Asia/Jakarta").format("DD MMM YYYY HH:mm");
      const signal = interpretEvent(ev);

      const message =
        `📊 *Hasil Event Ekonomi Dirilis*\n\n` +
        `- [${ev.country}] *${ev.event}* (${ev.importance})\n` +
        `🕒 ${time}\n` +
        `📌 Actual: ${ev.actual}, Forecast: ${ev.forecast}, Previous: ${ev.previous}\n\n` +
        `➡️ Interpretasi: *${signal}*`;

      await sendTelegram(message);
      sentEvents.add(ev.event);
    }
  }
}

// === Scheduler ===
function startScheduler() {
  console.log("⏳ Bot ekonomi aktif...");

  // cek setiap menit untuk event hari ini
  setInterval(() => {
    watchTodayEvents().catch(e => console.error(e));
  }, 60 * 1000);

  // cek tiap 1 menit apakah jam 21:00 WIB (untuk reminder besok)
  setInterval(() => {
    const now = moment().tz("Asia/Jakarta");
    if (now.hour() === 21 && now.minute() === 0) {
      sendTomorrowReminder().catch(e => console.error(e));
    }
  }, 60 * 1000);
}

startScheduler();

