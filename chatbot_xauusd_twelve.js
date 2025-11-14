require("dotenv").config();
const axios = require("axios");
const { RSI, SMA, ATR } = require("technicalindicators");

// === Telegram ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// === Twelve Data API ===
const API_KEY = process.env.TWELVE_DATA_API_KEY;

console.log("BOT_TOKEN:", BOT_TOKEN);

async function sendTelegram(msg) {
  try {
    await axios.post(TELEGRAM_URL, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "HTML"
    });
    console.log("✔️ Terkirim:", msg);
  } catch (err) {
    console.error("❌ Gagal kirim:", err.response?.data || err.message);
  }
}

// Fetch data XAUUSD 15m
async function fetchXAUUSD() {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=15min&outputsize=300&apikey=${API_KEY}`;
    const res = await axios.get(url);

    if (!res.data || !res.data.values) return null;

    return res.data.values.reverse().map(d => ({
      time: d.datetime,
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close)
    }));
  } catch (e) {
    console.error("Fetch error:", e.message);
    return null;
  }
}

function getATRFactorsBySession() {
  const hour = new Date().getUTCHours(); // UTC
  if (hour >= 0 && hour < 8) {
    return { buyArea: 1.0, stopLoss: 2.0, tp1: 1.0, tp2: 1.5, tp3: 2.0 }; // Tokyo
  } else if (hour >= 8 && hour < 16) {
    return { buyArea: 1.0, stopLoss: 2.0, tp1: 1.0, tp2: 1.5, tp3: 2.0 }; // London
  } else {
    return { buyArea: 1.5, stopLoss: 3.0, tp1: 1.5, tp2: 2.5, tp3: 3.0 }; // US
  }
}

async function checkSignal() {
  const candles = await fetchXAUUSD();
  if (!candles || candles.length < 200) {
    console.log("Data kurang.");
    return;
  }

  const closes = candles.map(c => c.close);

  // === Indikator ===
  const rsi = RSI.calculate({ period: 14, values: closes });
  const ma5 = SMA.calculate({ period: 5, values: closes });
  const ma20 = SMA.calculate({ period: 20, values: closes });
  const ma50 = SMA.calculate({ period: 50, values: closes });
  const ma100 = SMA.calculate({ period: 100, values: closes });

  // === ATR 15m ===
  const atr = ATR.calculate({
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: closes,
    period: 14
  });

  const ATR_VALUE = atr.at(-1);
  const R = rsi.at(-1);
  const M5 = ma5.at(-1);
  const M20 = ma20.at(-1);
  const M50 = ma50.at(-1);
  const M100 = ma100.at(-1);
  const price = closes.at(-1);

  console.log(`[15m] Price:${price} | RSI:${R} | ATR:${ATR_VALUE.toFixed(2)} | MA5:${M5} MA20:${M20}`);

  const atrFactor = getATRFactorsBySession();
  const buyLower = (price - ATR_VALUE * atrFactor.buyArea).toFixed(2);
  const buyUpper = (price - ATR_VALUE * (atrFactor.buyArea * 0.5)).toFixed(2);
  const SL = (price - ATR_VALUE * atrFactor.stopLoss).toFixed(2);
  const TP1 = (price + ATR_VALUE * atrFactor.tp1).toFixed(2);
  const TP2 = (price + ATR_VALUE * atrFactor.tp2).toFixed(2);
  const TP3 = (price + ATR_VALUE * atrFactor.tp3).toFixed(2);

  const isBuy = M5 > M20 && M20 > M50 && R < 60;
  if (isBuy) {
    sendTelegram(
      `🚨 <b>SIGNAL BUY (15m)</b>\n\n` +
        `<b>Price:</b> ${price}\n` +
        `<b>RSI:</b> ${R.toFixed(2)}\n` +
        `<b>ATR(14):</b> ${ATR_VALUE.toFixed(2)}\n\n` +
        `<b>Buy Area:</b> ${buyLower} - ${buyUpper}\n` +
        `<b>Stop Loss:</b> ${SL}\n` +
        `<b>Take Profit:</b> TP1:${TP1} | TP2:${TP2} | TP3:${TP3}\n\n` +
        `MA Bullish 📌 BUY NOW`
    );
  }

  const isStrongDown = M100 > M50 && M50 > M20 && M20 > M5;
  if (isStrongDown) {
    sendTelegram(
      `⚠️ <b>WARNING TREND TURUN - XAUUSD (15m)</b>\n\n` +
        `MA tersusun 100 > 50 > 20 > 5\n` +
        `📉 Market kemungkinan turun. Hati-hati entry BUY!`
    );
  }
}

// === Jalankan tepat per 15 menit ===
function runEveryQuarter() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  // Hitung delay sampai menit berikutnya kelipatan 15
  const delayMs = ((15 - (minutes % 15)) % 15) * 60 * 1000 - seconds * 1000;

  console.log(`Menunggu ${Math.round(delayMs/1000)} detik sampai candle berikutnya...`);

  setTimeout(() => {
    checkSignal();
    setInterval(checkSignal, 15 * 60 * 1000); // tiap 15 menit
  }, delayMs);
}

runEveryQuarter();
