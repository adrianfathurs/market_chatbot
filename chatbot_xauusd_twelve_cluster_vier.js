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

// ==============================
// CONFIG
// ==============================

const jarakLevel = 15;

let currentCluster = null;
let sessionActive = false;

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

        console.log("Telegram error:", err.response?.data || err.message);

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

    }

    else if (level === "B") {

        B = openPrice;
        C = B - jarakLevel;
        A = B + jarakLevel;
        D = C - jarakLevel;

    }

    else {

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
// CEK SESSION
// ==============================

function checkSession() {

    const now = new Date();

    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    return (

        (hour === 23 && minute === 0) || // Asia
        (hour === 7 && minute === 0) ||  // Europe
        (hour === 13 && minute === 0)    // US

    );

}

// ==============================
// UPDATE CLUSTER
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

    if (!sessionActive) return;

    const candles = await fetchData();

    if (!candles || !currentCluster) return;

    const price = candles.at(-1).close;

    console.log("Price:", price);

    if (price <= currentCluster.D) {

        await sendTelegram(

`⚠️ <b>XAUUSD CLUSTER ALERT</b>

Price masuk area D

Price : ${price}

Cluster Level
A  : ${currentCluster.A}
B  : ${currentCluster.B}
C  : ${currentCluster.C}
D  : ${currentCluster.D}
D2 : ${currentCluster.D2}
D3 : ${currentCluster.D3}
D4 : ${currentCluster.D4}

Potensi area reversal / liquidity zone`

        );

        sessionActive = false;
        currentCluster = null;

    }

}

// ==============================
// BOT START
// ==============================

async function startBot() {

    console.log("🤖 Cluster Bot Running...");

    await sendTelegram("🤖 XAUUSD Cluster Bot aktif");

    setInterval(async () => {

        // cek apakah session baru
        if (checkSession()) {

            console.log("Session open -> update cluster");

            await updateCluster();

            sessionActive = true;

        }

        // monitor harga
        await monitorPrice();

    }, 60 * 1000);

}

startBot();