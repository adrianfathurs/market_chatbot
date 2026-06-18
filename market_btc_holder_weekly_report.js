require("dotenv").config();

const axios = require("axios");
const cron = require("node-cron");
const { EMA } = require("technicalindicators");

// ======================================
// CONFIG
// ======================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

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

    console.log("✅ Telegram Sent");
  } catch (err) {
    console.error(
      err.response?.data || err.message
    );
  }
}

// ======================================
// BTC DATA
// ======================================

async function getBTCData() {

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=BTC/USD` +
    `&interval=1day` +
    `&outputsize=365` +
    `&apikey=${API_KEY}`;

  const res = await axios.get(url);

  if (!res.data.values) {
    throw new Error(
      "Failed get BTC data"
    );
  }

  return res.data.values
    .reverse()
    .map(c => ({
      time: c.datetime,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }));
}

// ======================================
// FUNDING RATE
// ======================================

async function getFundingRate() {

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
// OPEN INTEREST
// ======================================

async function getOpenInterestChange() {

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

  const data = res.data;

  const first =
    Number(data[0].sumOpenInterest);

  const last =
    Number(
      data[data.length - 1]
        .sumOpenInterest
    );

  return (
    ((last - first) / first) *
    100
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
// STATUS
// ======================================

function getStatus(score) {

  if (score >= 90)
    return {
      status:
        "🟢 GENERATIONAL BUY",
      action:
        "Beli Besar (40%-50% Dana)"
    };

  if (score >= 75)
    return {
      status:
        "🟢 STRONG ACCUMULATION",
      action:
        "Tambah Posisi 25%-30%"
    };

  if (score >= 60)
    return {
      status:
        "🟢 ACCUMULATION",
      action:
        "Tambah Posisi 15%-20%"
    };

  if (score >= 40)
    return {
      status:
        "🟡 DCA ONLY",
      action:
        "Beli Rutin Mingguan"
    };

  if (score >= 20)
    return {
      status:
        "🟠 WAIT FOR DIP",
      action:
        "Simpan Cash"
    };

  return {
    status:
      "🔴 OVERHEATED",
    action:
      "Jangan Tambah Posisi"
  };
}

// ======================================
// GENERATE REPORT
// ======================================

async function generateHolderReport() {

  try {

    const candles =
      await getBTCData();

    const closes =
      candles.map(
        x => x.close
      );

    const currentPrice =
      closes.at(-1);

    // ====================
    // ATH
    // ====================

    const ath =
      Math.max(...closes);

    const drawdown =
      (
        ((ath -
          currentPrice) /
          ath) *
        100
      );

    // ====================
    // EMA
    // ====================

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

    // ====================
    // FUTURES DATA
    // ====================

    const funding =
      await getFundingRate();

    const oiChange =
      await getOpenInterestChange();

    const longShort =
      await getLongShortRatio();

    // ====================
    // SCORE
    // ====================

    let score = 0;

    // Drawdown

    if (drawdown >= 50)
      score += 40;
    else if (
      drawdown >= 40
    )
      score += 30;
    else if (
      drawdown >= 30
    )
      score += 20;
    else if (
      drawdown >= 20
    )
      score += 10;

    // EMA200

    if (
      currentPrice <
      ema200
    )
      score += 20;

    // Funding

    if (funding < 0)
      score += 15;

    // OI Flush

    if (oiChange < 0)
      score += 15;

    // Long Short

    if (longShort < 1)
      score += 10;

    // ====================
    // STATUS
    // ====================

    const result =
      getStatus(score);

    // ====================
    // REPORT
    // ====================

    const report =
`₿ BTC HOLDER REPORT (Holder, DCA CONCEPT)

Date
${new Date().toLocaleDateString("id-ID")}

====================

Price
${currentPrice.toFixed(0)}

ATH (365D)
${ath.toFixed(0)}

Drawdown
${drawdown.toFixed(2)}%

====================

EMA50
${ema50.toFixed(0)}

EMA200
${ema200.toFixed(0)}

====================

Funding Rate
${funding}

Open Interest
${oiChange.toFixed(2)}%

Long Short Ratio
${longShort.toFixed(2)}

====================

BOTTOM SCORE

${score}/100

====================

STATUS

${result.status}

====================

ACTION

${result.action}

====================

NOTE

Bot mencari area
akumulasi holder.

Bukan prediksi
bottom secara pasti.
`;

    await sendTelegram(
      report
    );

    console.log(
      "✅ Weekly Holder Report Sent"
    );

  } catch (err) {

    console.error(
      err.response?.data ||
      err.message
    );

  }
}

// ======================================
// TEST SEKARANG
// ======================================

generateHolderReport();

// ======================================
// KAMIS 17:00 WIB
// ======================================

cron.schedule(
  "5 17 * * 4",
  async () => {

    console.log(
      "Generate Weekly Report (Holder)(DCA CONCEPT)"
    );

    await generateHolderReport();

  },
  {
    timezone:
      "Asia/Jakarta"
  }
);

console.log(
  "🚀 BTC HOLDER BOT RUNNING"
);