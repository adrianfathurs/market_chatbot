require("dotenv").config();

const axios = require("axios");
const { EMA } = require("technicalindicators");

const API_KEY = process.env.TWELVE_DATA_API_KEY;

// ====================================
// CONFIG
// ====================================

const START_DATE = "2024-01-01";
const END_DATE = "2026-06-17";

const RR_TARGET = 2;

// ====================================
// FETCH DATA
// ====================================

async function fetchData() {
  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=XAU/USD` +
    `&interval=4h` +
    `&start_date=${START_DATE}` +
    `&end_date=${END_DATE}` +
    `&outputsize=5000` +
    `&apikey=${API_KEY}`;

  const response = await axios.get(url);

  if (!response.data.values) {
    throw new Error("Data tidak ditemukan");
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
}

// ====================================
// MAIN BACKTEST
// ====================================

async function runBacktest() {
  const candles = await fetchData();

  console.log(`Loaded ${candles.length} candles`);

  const closes = candles.map((c) => c.close);

  const ema50 = EMA.calculate({
    period: 50,
    values: closes,
  });

  // ====================================
  // OVERALL STATS
  // ====================================

  let totalTrade = 0;
  let win = 0;
  let lose = 0;

  let equityR = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;

  // ====================================
  // BUY STATS
  // ====================================

  let buyWin = 0;
  let buyLose = 0;

  let buyProfit = 0;
  let buyLoss = 0;

  // ====================================
  // SELL STATS
  // ====================================

  let sellWin = 0;
  let sellLose = 0;

  let sellProfit = 0;
  let sellLoss = 0;

  const trades = [];

  for (let i = 52; i < candles.length - 1; i++) {

    const mother = candles[i - 2];
    const inside = candles[i - 1];
    const breakout = candles[i];

    const ema = ema50[i - 50];

    if (!ema) continue;

    const isInsideBar =
      inside.high < mother.high &&
      inside.low > mother.low;

    if (!isInsideBar) continue;

    // ====================================
    // BUY
    // ====================================

    if (
      breakout.close > mother.high &&
      breakout.close > ema
    ) {

      totalTrade++;

      const entry = breakout.close;
      const sl = mother.low;

      const risk = entry - sl;

      if (risk <= 0) continue;

      const tp =
        entry + risk * RR_TARGET;

      let result = null;

      for (
        let j = i + 1;
        j < candles.length;
        j++
      ) {

        const next = candles[j];

        // SL
        if (next.low <= sl) {

          result = -1;

          lose++;
          buyLose++;

          buyLoss += 1;

          equityR -= 1;

          break;
        }

        // TP
        if (next.high >= tp) {

          result = RR_TARGET;

          win++;
          buyWin++;

          buyProfit += RR_TARGET;

          equityR += RR_TARGET;

          break;
        }
      }

      if (result !== null) {

        peakEquity = Math.max(
          peakEquity,
          equityR
        );

        maxDrawdown = Math.max(
          maxDrawdown,
          peakEquity - equityR
        );

        trades.push({
          type: "BUY",
          time: breakout.time,
          result,
        });
      }
    }

    // ====================================
    // SELL
    // ====================================

    else if (
      breakout.close < mother.low &&
      breakout.close < ema
    ) {

      totalTrade++;

      const entry = breakout.close;
      const sl = mother.high;

      const risk = sl - entry;

      if (risk <= 0) continue;

      const tp =
        entry - risk * RR_TARGET;

      let result = null;

      for (
        let j = i + 1;
        j < candles.length;
        j++
      ) {

        const next = candles[j];

        // SL
        if (next.high >= sl) {

          result = -1;

          lose++;
          sellLose++;

          sellLoss += 1;

          equityR -= 1;

          break;
        }

        // TP
        if (next.low <= tp) {

          result = RR_TARGET;

          win++;
          sellWin++;

          sellProfit += RR_TARGET;

          equityR += RR_TARGET;

          break;
        }
      }

      if (result !== null) {

        peakEquity = Math.max(
          peakEquity,
          equityR
        );

        maxDrawdown = Math.max(
          maxDrawdown,
          peakEquity - equityR
        );

        trades.push({
          type: "SELL",
          time: breakout.time,
          result,
        });
      }
    }
  }

  // ====================================
  // OVERALL RESULT
  // ====================================

  const winRate =
    totalTrade > 0
      ? (
          (win / totalTrade) *
          100
        ).toFixed(2)
      : 0;

  const grossProfit =
    trades
      .filter((t) => t.result > 0)
      .reduce(
        (a, b) => a + b.result,
        0
      );

  const grossLoss =
    Math.abs(
      trades
        .filter(
          (t) => t.result < 0
        )
        .reduce(
          (a, b) => a + b.result,
          0
        )
    );

  const profitFactor =
    grossLoss > 0
      ? (
          grossProfit /
          grossLoss
        ).toFixed(2)
      : 0;

  // ====================================
  // BUY RESULT
  // ====================================

  const totalBuy =
    buyWin + buyLose;

  const buyWinRate =
    totalBuy > 0
      ? (
          (buyWin / totalBuy) *
          100
        ).toFixed(2)
      : 0;

  const buyPF =
    buyLoss > 0
      ? (
          buyProfit /
          buyLoss
        ).toFixed(2)
      : 0;

  // ====================================
  // SELL RESULT
  // ====================================

  const totalSell =
    sellWin + sellLose;

  const sellWinRate =
    totalSell > 0
      ? (
          (sellWin / totalSell) *
          100
        ).toFixed(2)
      : 0;

  const sellPF =
    sellLoss > 0
      ? (
          sellProfit /
          sellLoss
        ).toFixed(2)
      : 0;

  // ====================================
  // OUTPUT
  // ====================================

  console.log("\n===============================");
  console.log("INSIDE BAR H4");
  console.log(
    `XAUUSD ${START_DATE} - ${END_DATE}`
  );
  console.log("===============================");

  console.log(
    "Total Trade:",
    totalTrade
  );

  console.log(
    "Win:",
    win
  );

  console.log(
    "Lose:",
    lose
  );

  console.log(
    "Win Rate:",
    winRate + "%"
  );

  console.log(
    "Profit Factor:",
    profitFactor
  );

  console.log(
    "Net R:",
    equityR.toFixed(2)
  );

  console.log(
    "Max Drawdown:",
    maxDrawdown.toFixed(2),
    "R"
  );

  console.log("===============================");

  console.log("\n===== BUY STATS =====");

  console.log(
    "Total Buy:",
    totalBuy
  );

  console.log(
    "Buy Win:",
    buyWin
  );

  console.log(
    "Buy Lose:",
    buyLose
  );

  console.log(
    "Buy Win Rate:",
    buyWinRate + "%"
  );

  console.log(
    "Buy PF:",
    buyPF
  );

  console.log("\n===== SELL STATS =====");

  console.log(
    "Total Sell:",
    totalSell
  );

  console.log(
    "Sell Win:",
    sellWin
  );

  console.log(
    "Sell Lose:",
    sellLose
  );

  console.log(
    "Sell Win Rate:",
    sellWinRate + "%"
  );

  console.log(
    "Sell PF:",
    sellPF
  );

  console.log(
    "\n===============================\n"
  );
}

runBacktest().catch(console.error);