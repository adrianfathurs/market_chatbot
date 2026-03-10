require("dotenv").config();
const axios = require("axios");
const { EMA, ATR } = require("technicalindicators");

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
// FETCH DATA
// ==============================

async function fetchData(interval) {

  const url =
    `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=300&apikey=${API_KEY}`;

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
// REJECTION CANDLE
// ==============================

function bullishRejection(candle) {

  const body = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  return lowerWick > body * 1.5;
}

function bearishRejection(candle) {

  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);

  return upperWick > body * 1.5;
}

// ==============================
// MAIN SIGNAL
// ==============================

async function checkSignal() {

  const candlesM15 = await fetchData("15min");
  const candlesH1 = await fetchData("1h");

  if (!candlesM15 || !candlesH1) return;

  const closeM15 = candlesM15.map(c => c.close);
  const closeH1 = candlesH1.map(c => c.close);

  const last = candlesM15.at(-1);

  // ==============================
  // HTF TREND
  // ==============================

  const ema50 = EMA.calculate({
    period: 50,
    values: closeH1
  });

  const ema200 = EMA.calculate({
    period: 200,
    values: closeH1
  });

  const trendBull = ema50.at(-1) > ema200.at(-1);
  const trendBear = ema50.at(-1) < ema200.at(-1);

  // ==============================
  // ATR
  // ==============================

  const atr = ATR.calculate({
    high: candlesM15.map(c => c.high),
    low: candlesM15.map(c => c.low),
    close: closeM15,
    period: 14
  });

  const ATR_VALUE = atr.at(-1);

  const price = closeM15.at(-1);

  // ==============================
  // LIQUIDITY SWEEP
  // ==============================

  const lookback = 10;

  const recentHigh = Math.max(
    ...candlesM15.slice(-lookback).map(c => c.high)
  );

  const recentLow = Math.min(
    ...candlesM15.slice(-lookback).map(c => c.low)
  );

  const sweepLow = last.low < recentLow;
  const sweepHigh = last.high > recentHigh;

  // ==============================
  // ENTRY ZONE
  // ==============================

  const entryBuyLow = (price - ATR_VALUE * 0.5).toFixed(2);
  const entryBuyHigh = price.toFixed(2);

  const entrySellLow = price.toFixed(2);
  const entrySellHigh = (price + ATR_VALUE * 0.5).toFixed(2);

  // ==============================
  // BUY SIGNAL
  // ==============================

  if (
    trendBull &&
    sweepLow &&
    bullishRejection(last)
  ) {

    const SL = (price - ATR_VALUE * 2).toFixed(2);

    const TP1 = (price + ATR_VALUE).toFixed(2);
    const TP2 = (price + ATR_VALUE * 2).toFixed(2);
    const TP3 = (price + ATR_VALUE * 3).toFixed(2);

    sendTelegram(
`🚀 <b>XAUUSD BUY - CICI STYLE</b>

Entry Zone
${entryBuyLow} - ${entryBuyHigh}

Stop Loss
${SL}

Take Profit
${TP1}
${TP2}
${TP3}`
    );
  }

  // ==============================
  // SELL SIGNAL
  // ==============================

  if (
    trendBear &&
    sweepHigh &&
    bearishRejection(last)
  ) {

    const SL = (price + ATR_VALUE * 2).toFixed(2);

    const TP1 = (price - ATR_VALUE).toFixed(2);
    const TP2 = (price - ATR_VALUE * 2).toFixed(2);
    const TP3 = (price - ATR_VALUE * 3).toFixed(2);

    sendTelegram(
`📉 <b>XAUUSD SELL - CICI STYLE</b>

Entry Zone
${entrySellLow} - ${entrySellHigh}

Stop Loss
${SL}

Take Profit
${TP1}
${TP2}
${TP3}`
    );
  }

}

// ==============================
// RUN BOT
// ==============================

setInterval(checkSignal, 15 * 60 * 1000);

console.log("🤖 PURE CICI STYLE BOT RUNNING...");