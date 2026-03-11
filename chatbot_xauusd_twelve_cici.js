require("dotenv").config();
const axios = require("axios");
const { CCI } = require("technicalindicators");

// ==============================
// TELEGRAM
// ==============================

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// ==============================
// API
// ==============================

const API_KEY = process.env.TWELVE_DATA_API_KEY;

// ==============================
// ANTI SPAM (1 SIGNAL PER CANDLE)
// ==============================

let lastSignalTime = null;

// ==============================
// TELEGRAM FUNCTION
// ==============================

async function sendTelegram(msg) {
  try {
    await axios.post(TELEGRAM_URL, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "HTML"
    });

    console.log("✔ Signal terkirim");
  } catch (err) {
    console.log("Telegram error:", err.message);
  }
}

// ==============================
// FETCH MARKET DATA
// ==============================

async function fetchData() {

  try {

    const url =
      `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=15min&outputsize=200&apikey=${API_KEY}`;

    const res = await axios.get(url);

    if (!res.data.values) return null;

    return res.data.values.reverse().map(d => ({
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      time: d.datetime
    }));

  } catch (err) {

    console.log("API Error:", err.message);
    return null;

  }

}

// ==============================
// MAIN SIGNAL CHECK
// ==============================

async function checkSignal() {

  const candles = await fetchData();

  if (!candles) return;

  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);

  const last = candles.at(-1);

  // ==============================
  // ANTI SPAM
  // ==============================

  if (lastSignalTime === last.time) return;

  // ==============================
  // CCI CALCULATION
  // ==============================

  const cci = CCI.calculate({
    high,
    low,
    close,
    period: 20
  });

  if (!cci.length) return;

  const CCI_VALUE = cci.at(-1);

  // ==============================
  // SIGNAL CONDITION
  // ==============================

  if (CCI_VALUE < -100) {
    lastSignalTime = last.time;
    sendTelegram(
  `🚨 <b>PANTAU CICI GUYS</b> 🚨
    Current CCI Value : ${CCI_VALUE.toFixed(2)}`);
  }
}

// ==============================
// RUN BOT
// ==============================

setInterval(checkSignal, 60 * 1000);

console.log("🤖 CICI BOT RUNNING (CHECK EVERY 1 MINUTE)");