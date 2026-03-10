require("dotenv").config();
const axios = require("axios");
const { EMA, ATR } = require("technicalindicators");

// ==============================
// RULE
    /* Berikut full code yang sudah diperbaiki dari kode kamu dengan tambahan:
    ✅ Entry Zone (0.5 ATR)
    ✅ Struktur signal lebih jelas
    ✅ Tetap memakai strategi kamu
    HTF Trend (EMA 50 / 200 H1)
    Liquidity Sweep
    Killzone Session
    ATR Risk Management */
// ==============================

// ==============================
// TELEGRAM
// ==============================

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// ==============================
// API KEY
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
// FETCH MARKET DATA
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
// KILLZONE FILTER
// ==============================

function isKillzone() {

    const now = new Date();

    const hour = now.getUTCHours() + 7; // WIB

    if (
        (hour >= 14 && hour <= 17) || // London
        (hour >= 19 && hour <= 23)    // New York
    ) {
        return true;
    }

    return false;
}

// ==============================
// MAIN SIGNAL LOGIC
// ==============================

async function checkSignal() {

    if (!isKillzone()) {
        console.log("Outside killzone");
        return;
    }

    const candlesM15 = await fetchData("15min");
    const candlesH1 = await fetchData("1h");

    if (!candlesM15 || !candlesH1) return;

    const closeM15 = candlesM15.map(c => c.close);
    const closeH1 = candlesH1.map(c => c.close);

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

    const EMA50 = ema50.at(-1);
    const EMA200 = ema200.at(-1);

    const trendBull = EMA50 > EMA200;
    const trendBear = EMA50 < EMA200;

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

    const last = candlesM15.at(-1);

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

    const sweepBuy =
        last.low < recentLow &&
        last.close > recentLow;

    const sweepSell =
        last.high > recentHigh &&
        last.close < recentHigh;

    // ==============================
    // ENTRY ZONE (ATR BASED)
    // ==============================

    const entryBuyLow = (price - ATR_VALUE * 0.5).toFixed(2);
    const entryBuyHigh = price.toFixed(2);

    const entrySellLow = price.toFixed(2);
    const entrySellHigh = (price + ATR_VALUE * 0.5).toFixed(2);

    // ==============================
    // BUY SIGNAL
    // ==============================

    if (trendBull && sweepBuy) {

        const SL = (price - ATR_VALUE * 2).toFixed(2);

        const TP1 = (price + ATR_VALUE).toFixed(2);
        const TP2 = (price + ATR_VALUE * 2).toFixed(2);
        const TP3 = (price + ATR_VALUE * 3).toFixed(2);

        sendTelegram(
            `🚀 <b>XAUUSD BUY SIGNAL</b>
                Entry Zone :
                ${entryBuyLow} - ${entryBuyHigh}
                HTF Trend : Bullish
                Liquidity Sweep : Yes
                Stop Loss : ${SL}

                Take Profit :
                TP1 : ${TP1}
                TP2 : ${TP2}
                TP3 : ${TP3}`
        );
    }

    // ==============================
    // SELL SIGNAL
    // ==============================

    if (trendBear && sweepSell) {

        const SL = (price + ATR_VALUE * 2).toFixed(2);

        const TP1 = (price - ATR_VALUE).toFixed(2);
        const TP2 = (price - ATR_VALUE * 2).toFixed(2);
        const TP3 = (price - ATR_VALUE * 3).toFixed(2);

        sendTelegram(
            `📉 <b>XAUUSD SELL SIGNAL</b>
                Entry Zone :
                ${entrySellLow} - ${entrySellHigh}

                HTF Trend : Bearish
                Liquidity Sweep : Yes

                Stop Loss :
                ${SL}

                Take Profit :
                TP1 : ${TP1}
                TP2 : ${TP2}
                TP3 : ${TP3}`
                        );
                    }

        }

// ==============================
// RUN EVERY 15 MIN
// ==============================

setInterval(checkSignal, 15 * 60 * 1000);

console.log("🤖 XAUUSD Bot Running...");