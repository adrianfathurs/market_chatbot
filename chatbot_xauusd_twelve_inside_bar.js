require("dotenv").config();

const axios = require("axios");
const { EMA } = require("technicalindicators");

// ======================================
// CONFIG
// ======================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

let lastProcessedCandle = null;

// ======================================
// TELEGRAM
// ======================================

async function sendTelegram(message) {
  try {
    await axios.post(`${TELEGRAM_URL}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });

    console.log("✅ Telegram Sent");
  } catch (err) {
    console.error(
      "Telegram Error:",
      err.response?.data || err.message
    );
  }
}

// ======================================
// FETCH DATA
// ======================================

async function fetchData() {
  try {
    const url =
      `https://api.twelvedata.com/time_series` +
      `?symbol=XAU/USD` +
      `&interval=4h` +
      `&outputsize=200` +
      `&apikey=${API_KEY}`;

    const response = await axios.get(url);

    if (!response.data.values) {
      console.log("No candle data");
      return null;
    }

    return response.data.values
      .reverse()
      .map((c) => ({
        time: c.datetime,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));
  } catch (err) {
    console.error(
      "Fetch Error:",
      err.response?.data || err.message
    );
    return null;
  }
}

// ======================================
// SIGNAL ENGINE
// ======================================

async function checkSignal() {
  console.log(
    `[${new Date().toLocaleString()}] Checking signal...`
  );

  const candles = await fetchData();

  if (!candles || candles.length < 60) {
    return;
  }

  const closes = candles.map((x) => x.close);

  const ema50 = EMA.calculate({
    period: 50,
    values: closes,
  });

  if (!ema50.length) return;

  const emaValue = ema50[ema50.length - 1];

  // --------------------------------------
  // Struktur candle
  // --------------------------------------

  const motherBar = candles[candles.length - 3];
  const insideBar = candles[candles.length - 2];
  const breakoutBar = candles[candles.length - 1];

  // Anti duplicate
  if (
    lastProcessedCandle === breakoutBar.time
  ) {
    return;
  }

  const isInsideBar =
    insideBar.high < motherBar.high &&
    insideBar.low > motherBar.low;

  if (!isInsideBar) {
    console.log("No Inside Bar");
    return;
  }

  // ======================================
  // BUY SIGNAL
  // ======================================

  const buySignal =
    breakoutBar.close > motherBar.high &&
    breakoutBar.close > emaValue;

  if (buySignal) {
    lastProcessedCandle =
      breakoutBar.time;

    const entry = breakoutBar.close;
    const sl = motherBar.low;

    const risk = entry - sl;

    const tp1 = entry + risk;
    const tp2 = entry + risk * 2;
    const tp3 = entry + risk * 3;

    await sendTelegram(
`🚀 <b>INSIDE BAR BUY</b>

Symbol : XAUUSD
TF : H4

Time :
${breakoutBar.time}

Entry :
${entry.toFixed(2)}

SL :
${sl.toFixed(2)}

TP1 :
${tp1.toFixed(2)}

TP2 :
${tp2.toFixed(2)}

TP3 :
${tp3.toFixed(2)}

Risk :
${risk.toFixed(2)}

EMA50 :
${emaValue.toFixed(2)}

✅ Inside Bar Valid
✅ Breakout Confirmed
✅ Above EMA50`
    );

    console.log("BUY SIGNAL");
    return;
  }

  // ======================================
  // SELL SIGNAL
  // ======================================

  const sellSignal =
    breakoutBar.close < motherBar.low &&
    breakoutBar.close < emaValue;

  if (sellSignal) {
    lastProcessedCandle =
      breakoutBar.time;

    const entry = breakoutBar.close;
    const sl = motherBar.high;

    const risk = sl - entry;

    const tp1 = entry - risk;
    const tp2 = entry - risk * 2;
    const tp3 = entry - risk * 3;

    await sendTelegram(
`🔻 <b>INSIDE BAR SELL</b>

Symbol : XAUUSD
TF : H4

Time :
${breakoutBar.time}

Entry :
${entry.toFixed(2)}

SL :
${sl.toFixed(2)}

TP1 :
${tp1.toFixed(2)}

TP2 :
${tp2.toFixed(2)}

TP3 :
${tp3.toFixed(2)}

Risk :
${risk.toFixed(2)}

EMA50 :
${emaValue.toFixed(2)}

✅ Inside Bar Valid
✅ Breakout Confirmed
✅ Below EMA50`
    );

    console.log("SELL SIGNAL");
  }
}

// ======================================
// RUN BOT
// ======================================

async function startBot() {
  console.log(
    "🚀 XAUUSD H4 INSIDE BAR BOT STARTED"
  );

  await checkSignal();

  setInterval(async () => {
    await checkSignal();
  }, 5 * 60 * 1000); // 5 menit
}

startBot();