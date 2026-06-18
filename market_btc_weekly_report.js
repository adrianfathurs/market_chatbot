require("dotenv").config();

const axios = require("axios");
const cron = require("node-cron");
const { EMA } = require("technicalindicators");

// ======================================
// CONFIG
// ======================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TWELVE_API_KEY = process.env.TWELVE_DATA_API_KEY;

const TELEGRAM_URL =
  `https://api.telegram.org/bot${BOT_TOKEN}`;

// ======================================
// TELEGRAM
// ======================================

async function sendTelegram(message) {
  try {
    await axios.post(
      `${TELEGRAM_URL}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML"
      }
    );

    console.log("Telegram Sent");
  } catch (err) {
    console.error(
      err.response?.data || err.message
    );
  }
}

// ======================================
// BTC DAILY DATA
// ======================================

async function getBTCData() {
  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=BTC/USD` +
    `&interval=1day` +
    `&outputsize=250` +
    `&apikey=${TWELVE_API_KEY}`;

  const res = await axios.get(url);

  return res.data.values
    .reverse()
    .map(x => ({
      time: x.datetime,
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close)
    }));
}

// ======================================
// OPEN INTEREST
// ======================================

async function getOpenInterest() {

  const res = await axios.get(
    "https://fapi.binance.com/futures/data/openInterestHist",
    {
      params: {
        symbol: "BTCUSDT",
        period: "1d",
        limit: 7
      }
    }
  );

  return res.data;
}

// ======================================
// FUNDING
// ======================================

async function getFunding() {

  const res = await axios.get(
    "https://fapi.binance.com/fapi/v1/premiumIndex",
    {
      params: {
        symbol: "BTCUSDT"
      }
    }
  );

  return Number(
    res.data.lastFundingRate
  );
}

// ======================================
// LONG SHORT RATIO
// ======================================

async function getLongShortRatio() {

  const res = await axios.get(
    "https://fapi.binance.com/futures/data/globalLongShortAccountRatio",
    {
      params: {
        symbol: "BTCUSDT",
        period: "1d",
        limit: 1
      }
    }
  );

  return Number(
    res.data[0].longShortRatio
  );
}

// ======================================
// REPORT ENGINE
// ======================================

async function generateWeeklyReport() {

  try {

    const candles = await getBTCData();

    const closes =
      candles.map(x => x.close);

    const price =
      closes[closes.length - 1];

    const ema50 =
      EMA.calculate({
        period: 50,
        values: closes
      }).at(-1);

    const ema200 =
      EMA.calculate({
        period: 200,
        values: closes
      }).at(-1);

    // ======================
    // DERIVATIVES
    // ======================

    const oiData =
      await getOpenInterest();

    const firstOI =
      Number(oiData[0].sumOpenInterest);

    const lastOI =
      Number(
        oiData[oiData.length - 1]
          .sumOpenInterest
      );

    const oiChange =
      (
        ((lastOI - firstOI) /
          firstOI) *
        100
      );

    const funding =
      await getFunding();

    const longShort =
      await getLongShortRatio();

    // ======================
    // LIQUIDITY
    // ======================

    const recent =
      candles.slice(-30);

    const liquidityAbove =
      Math.max(
        ...recent.map(
          x => x.high
        )
      );

    const liquidityBelow =
      Math.min(
        ...recent.map(
          x => x.low
        )
      );

    // ======================
    // SCORE
    // ======================

    let score = 50;

    if (price > ema50)
      score += 15;

    if (price > ema200)
      score += 20;

    if (oiChange > 0)
      score += 10;

    if (
      funding > 0 &&
      funding < 0.03
    )
      score += 10;

    if (longShort < 1)
      score += 10;

    if (longShort > 2)
      score -= 10;

    if (score > 100)
      score = 100;

    if (score < 0)
      score = 0;

    const bullish =
      score;

    const bearish =
      100 - score;

    // ======================
    // ACTION
    // ======================

    let action =
      "WAIT";

    if (bullish >= 70)
      action =
        "BUY PULLBACK";

    if (bullish >= 85)
      action =
        "STRONG BUY";

    if (bearish >= 70)
      action =
        "SELL RALLY";

    // ======================
    // REPORT
    // ======================

    const report =

`📊 BTC WEEKLY MARKET REPORT

Price
${price.toFixed(0)}

=====================

TREND

EMA50
${ema50.toFixed(0)}

EMA200
${ema200.toFixed(0)}

=====================

DERIVATIVES

Funding
${funding}

Open Interest Change
${oiChange.toFixed(2)}%

Long Short Ratio
${longShort.toFixed(2)}

=====================

LIQUIDITY

Liquidity Above
${liquidityAbove.toFixed(0)}

Liquidity Below
${liquidityBelow.toFixed(0)}

=====================

PROBABILITY

Bullish
${bullish}%

Bearish
${bearish}%

=====================

ACTION

${action}

Target Atas
${liquidityAbove.toFixed(0)}

Invalidation
${liquidityBelow.toFixed(0)}
`;

    await sendTelegram(
      report
    );

    console.log(
      "Weekly Report Sent"
    );

  } catch (err) {

    console.error(
      err.response?.data ||
      err.message
    );

  }
}

// ======================================
// RUN NOW
// ======================================

generateWeeklyReport();

// ======================================
// SETIAP KAMIS 17:00 WIB
// ======================================

cron.schedule(
  "0 17 * * 4",
  async () => {
    console.log(
      "Generating Weekly Report..."
    );

    await generateWeeklyReport();
  },
  {
    timezone:
      "Asia/Jakarta"
  }
);

console.log(
  "BTC WEEKLY BOT STARTED"
);