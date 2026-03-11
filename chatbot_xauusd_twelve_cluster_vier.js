require("dotenv").config();
const axios = require("axios");
const { RSI } = require("technicalindicators");

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

// jarak level seperti di Pine Script
const jarakLevel = 15;

// simpan cluster aktif
let currentCluster = null;

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

    console.log("✔ Alert terkirim");
  } catch (err) {
    console.log("Telegram error:", err.message);
  }
}

// ==============================
// FETCH DATA
// ==============================

async function fetchData() {

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
}

// ==============================
// LEVEL DARI RSI
// ==============================

function getLevelFromRSI(rsi) {

  if (rsi >= 60) return "A";
  if (rsi >= 45) return "B";
  return "D";
}

// ==============================
// HITUNG CLUSTER
// ==============================

function calculateCluster(openPrice, rsi) {

  const level = getLevelFromRSI(rsi);

  let A, B, C, D;

  if (level === "A") {

    A = openPrice;
    B = A - jarakLevel;
    C = B - jarakLevel;
    D = C - jarakLevel;

  } else if (level === "B") {

    B = openPrice;
    C = B - jarakLevel;
    A = B + jarakLevel;
    D = C - jarakLevel;

  } else {

    D = openPrice;
    C = D + jarakLevel;
    B = C + jarakLevel;
    A = B + jarakLevel;
  }

  return {
    A,
    B,
    C,
    D,
    D2: D - jarakLevel,
    D3: D - jarakLevel * 2,
    D4: D - jarakLevel * 3
  };
}

// ==============================
// CEK SESI
// ==============================

function checkSession() {

  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  return (

    (hour === 23 && minute === 0) || // Asia
    (hour === 7 && minute === 0)  || // Europe
    (hour === 13 && minute === 0)    // US

  );
}

// ==============================
// UPDATE CLUSTER SAAT OPEN SESI
// ==============================

async function updateCluster() {

  const candles = await fetchData();
  if (!candles) return;

  const close = candles.map(c => c.close);

  const rsi = RSI.calculate({
    period: 14,
    values: close
  });

  const rsiPrev = rsi.at(-2);
  const openPrice = candles.at(-1).open;

  currentCluster = calculateCluster(openPrice, rsiPrev);

  console.log("Cluster updated:", currentCluster);
}

// ==============================
// MONITOR PRICE
// ==============================

async function monitorPrice() {

  const candles = await fetchData();
  if (!candles || !currentCluster) return;

  const price = candles.at(-1).close;

  if (price <= currentCluster.D) {

    sendTelegram(
        `⚠️ <b>XAUUSD CLUSTER ALERT</b>

        Price masuk area D

        Price : ${price}

        Cluster Level
        D  : ${currentCluster.D}
        D2 : ${currentCluster.D2}
        D3 : ${currentCluster.D3}
        D4 : ${currentCluster.D4}

        Potensi area reversal / liquidity zone`
    );

    currentCluster = null;
  }
}

// ==============================
// BOT LOOP
// ==============================

setInterval(async () => {

  if (checkSession()) {

    await updateCluster();

  }

  await monitorPrice();

}, 15 * 60 * 1000);

console.log("🤖 Cluster Bot Running...");