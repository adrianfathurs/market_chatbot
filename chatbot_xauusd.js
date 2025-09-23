require("dotenv").config();
const axios = require("axios");
const { RSI, SMA, MACD, ATR } = require("technicalindicators");
const { generateChart, sendImageToTelegram } = require("./utils/chartutils");

// === Konfigurasi Telegram ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// === Konfigurasi Twelve Data API ===
const API_KEY = process.env.TWELVE_DATA_API_KEY;

// === Fungsi Kirim Pesan Telegram ===
async function sendTelegram(msg) {
  try {
    await axios.post(TELEGRAM_URL, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "Markdown",
    });
    console.log("✅ Sinyal terkirim ke Telegram!");
  } catch (err) {
    console.error("❌ Gagal kirim:", err.message);
  }
}

// === Ambil Data Harga XAU/USD ===
async function fetchXAUUSD() {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=15min&outputsize=500&apikey=${API_KEY}`;
    // outputsize diperbesar supaya bisa hitung statistik historis untuk threshold dinamis
    const res = await axios.get(url);
    if (!res.data || !res.data.values) {
      console.warn("fetchXAUUSD: respons API tidak berisi values");
      return null;
    }
    const data = res.data.values;
    // API returns newest first; kita balik sehingga oldest .. newest
    return data.reverse().map((d) => ({
      time: d.datetime || d.timestamp,
      close: parseFloat(d.close),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
    }));
  } catch (error) {
    console.error("fetchXAUUSD error:", error.message || error);
    return null;
  }
}

// === Utility statistik sederhana ===
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function meanAbs(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, v) => s + Math.abs(v), 0) / arr.length;
}

// === Analisis dan Kirim Sinyal ===
async function checkSignal() {
  try {
    const candles = await fetchXAUUSD();
    if (!candles || candles.length < 250) {
      console.warn("Data candles kurang untuk analisis (butuh >=250).");
      return;
    }

    const closes = candles.map((d) => d.close);
    const highs = candles.map((d) => d.high);
    const lows = candles.map((d) => d.low);
    const currentPrice = closes.at(-1);
    const lookbackForStats = 60; // pakai 60 candle (15m) ~ 15 jam untuk statistik dinamis

    // === Indikator teknikal ===
    const rsi = RSI.calculate({ period: 14, values: closes });
    const ma5 = SMA.calculate({ period: 5, values: closes });
    const ma20 = SMA.calculate({ period: 20, values: closes });
    const ma50 = SMA.calculate({ period: 50, values: closes });
    const ma100 = SMA.calculate({ period: 100, values: closes });
    const ma200 = SMA.calculate({ period: 200, values: closes });

    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    // safety checks
    if (
      !rsi.length ||
      !ma5.length ||
      !ma20.length ||
      !ma50.length ||
      !macdResult.length ||
      !atr.length
    ) {
      console.warn("Beberapa indikator belum menghasilkan nilai yang cukup.");
      return;
    }

    // === Ambil nilai terbaru ===
    const r = rsi.at(-1);
    const m5 = ma5.at(-1);
    const m20 = ma20.at(-1);
    const m50 = ma50.at(-1);
    const m100 = ma100.at(-1);
    const m200 = ma200.at(-1);

    const latestMACD = macdResult.at(-1);
    const prevMACD = macdResult.at(-2);
    const macdValue = latestMACD?.MACD ?? 0;
    const signalValue = latestMACD?.signal ?? 0;

    const latestATR = atr.at(-1);
    if (!latestATR || !latestMACD || !prevMACD) {
      console.warn("Indikator ATR/MACD tidak lengkap.");
      return;
    }

    // === Threshold ATR dinamis (dalam persen terhadap harga) ===
    // hitung ATR% untuk window terakhir
    const atrPercents = [];
    for (let i = Math.max(0, atr.length - lookbackForStats); i < atr.length; i++) {
      // map atr index to corresponding close index (atr starts after 14 candles)
      const closeForAtr = closes[closes.length - atr.length + i];
      if (closeForAtr) atrPercents.push((atr[i] / closeForAtr) * 100);
    }
    const avgAtrPercent = mean(atrPercents);
    const latestAtrPercent = (latestATR / currentPrice) * 100;
    // threshold adaptif: minimal 80% dari rata-rata ATR% namun tidak kurang dari 0.15%
    const atrPercentThreshold = Math.max(0.15, avgAtrPercent * 0.8);

    const isATRValid = latestAtrPercent >= atrPercentThreshold;
    const isMarketStrong = isATRValid;

    // === MA stacking: lebih fleksibel ===
    // requirement: MA5 > MA20 and MA20 > MA50 are preferred; tapi jika MA200 belum "tertabrak" kita terima selama short MA slope positif
    const maStackBasic = m5 > m20 && m20 > m50;
    // slope check (kecil tapi positif) untuk MA5 dan MA20
    const ma5Prev = ma5.at(-2);
    const ma20Prev = ma20.at(-2);
    const ma5Slope = ma5Prev ? (m5 - ma5Prev) / ma5Prev : 0;
    const ma20Slope = ma20Prev ? (m20 - ma20Prev) / ma20Prev : 0;
    const isShortMASlopingUp = ma5Slope > 0 || ma20Slope > 0;

    const isMABuyValid = maStackBasic || (isShortMASlopingUp && m5 > m20);
    const isMASellValid = m5 < m20 && m20 < m50;

    // === MACD cross dengan threshold relatif ===
    const macdDiff = macdValue - signalValue;
    const prevMacdDiff = prevMACD.MACD - prevMACD.signal;

    // ambil beberapa macd diffs historis untuk menentukan threshold relatif
    const macdDiffsHist = macdResult
      .slice(-lookbackForStats)
      .map((x) => x.MACD - x.signal)
      .filter((v) => Number.isFinite(v));
    const avgAbsMacdDiff = meanAbs(macdDiffsHist) || 0.0001; // minimal kecil agar tak 0

    // syarat cross: perubahan tanda + magnitudo relatif ke rata-rata historis
    const macdStrengthMultiplier = 0.6; // butuh seberapa besar dibanding rata-rata
    const isMACDCrossUp =
      macdDiff > 0 &&
      prevMacdDiff <= 0 &&
      Math.abs(macdDiff - prevMacdDiff) > avgAbsMacdDiff * macdStrengthMultiplier;
    const isMACDCrossDown =
      macdDiff < 0 &&
      prevMacdDiff >= 0 &&
      Math.abs(macdDiff - prevMacdDiff) > avgAbsMacdDiff * macdStrengthMultiplier;

    // === Resistance / Recent high check ===
    // ambil high tertinggi di last 20 candles sebagai resistance lokal
    const recentHighWindow = 20;
    const recentHigh = Math.max(...highs.slice(-recentHighWindow));
    // jika current price sangat dekat (misal <=0.5%) ke resistance, tandai "near resistance"
    const nearResistancePercent = 0.5; // 0.5%
    const isNearResistance =
      recentHigh > 0 &&
      ((recentHigh - currentPrice) / recentHigh) * 100 <= nearResistancePercent;

    // Jika near resistance, minta konfirmasi breakout -> currentPrice > recentHigh * (1 + breakout buffer)
    const breakoutBufferPercent = 0.1; // 0.1% breakout required
    const isBreakingOut = currentPrice > recentHigh * (1 + breakoutBufferPercent / 100);

    // === RSI bounds lebih longgar untuk pasar yang kuat ===
    // sebelumnya 25..65, ubah ke 25..75 agar tidak menolak momentum kuat
    const isRSIValid = r >= 25 && r <= 75;

    // === Logging ringkas ===
    console.log(
      `[XAUUSD][${new Date().toLocaleString()}] Price: ${currentPrice.toFixed(
        2
      )} | RSI: ${r.toFixed(2)} | ATR%: ${latestAtrPercent.toFixed(
        3
      )}% (thr ${atrPercentThreshold.toFixed(3)}%) | MAbuy:${isMABuyValid} | MACD:${macdValue.toFixed(
        4
      )} sig:${signalValue.toFixed(4)} | MACDcrossUp:${isMACDCrossUp} | nearRes:${isNearResistance}`
    );

    // === Sinyal BUY (dengan proteksi resistance dan konfirmasi tambahan jika near resistance) ===
    // kondisi dasar: RSI valid, MA bullish (fleksibel), MACD cross up, ATR valid
    let buyCondition = isRSIValid && isMABuyValid && isMACDCrossUp && isMarketStrong;

    // jika near resistance, minta breakout (isBreakingOut) atau MACD lebih kuat
    if (isNearResistance && !isBreakingOut) {
      // butuh MACD yang lebih kuat (misalnya 1.5x rata-rata abs diff)
      if (Math.abs(macdDiff) < avgAbsMacdDiff * 1.5) {
        buyCondition = false;
        console.log("Menolak BUY karena dekat resistance tanpa breakout dan MACD belum kuat.");
      } else {
        // jika MACD cukup kuat, boleh tetap BUY
        buyCondition = buyCondition && true;
      }
    }

    // === Eksekusi Sinyal BUY ===
    if (buyCondition) {
      const TP1 = (currentPrice + latestATR * 1.0).toFixed(2);
      const TP2 = (currentPrice + latestATR * 1.5).toFixed(2);
      const TP3 = (currentPrice + latestATR * 2.0).toFixed(2);
      const lowerBuy = (currentPrice - latestATR * 1.0).toFixed(2);
      const upperBuy = (currentPrice - latestATR * 0.5).toFixed(2);
      const SL = (currentPrice - latestATR * 1.5).toFixed(2);
      const rangeBuy = `${lowerBuy} - ${upperBuy}`;

      await sendTelegram(
        `🚨 *SINYAL BUY CONFIRM: XAUUSD [TF15]*\n\n` +
          `*Harga:* ${currentPrice.toFixed(2)}\n` +
          `*RSI:* ${r.toFixed(2)} ✅\n` +
          `*MA:* Kondisi bullish (fleksibel) ✅\n` +
          `*MACD:* ${macdValue.toFixed(4)} > ${signalValue.toFixed(4)} (Cross Up ✅)\n` +
          `*ATR:* ${latestATR.toFixed(2)} (${latestAtrPercent.toFixed(3)}%) ✅\n` +
          `📍 *Buy Area:* ${rangeBuy}\n` +
          `🎯 *TP1:* ${TP1}\n🎯 *TP2:* ${TP2}\n🎯 *TP3:* ${TP3}\n` +
          `🛡️ *SL:* ${SL}\n\n` +
          `_Catatan:_ ATR threshold adaptif (${atrPercentThreshold.toFixed(
            3
          )}%), pengecekan resistance & MACD relatif aktif.`
      );

      try {
        const chartPath = await generateChart(closes);
        const caption = `📈 *Sinyal BUY - XAUUSD*\nRSI: ${r.toFixed(2)} | MACD Cross Up ✅`;
        await sendImageToTelegram(chartPath, caption, BOT_TOKEN, CHAT_ID);
      } catch (err) {
        console.warn("generate/send chart gagal:", err.message || err);
      }
    }

    // === Sinyal SELL ===
    // condition sell: MA bearish or MACD cross down, RSI tidak oversold
    if (isMASellValid && isMACDCrossDown) {
      await sendTelegram(
        `🚨 *SINYAL BEARISH CONFIRM: XAUUSD [TF15]*\n\n` +
          `*Harga:* ${currentPrice.toFixed(2)}\n` +
          `*RSI:* ${r.toFixed(2)}\n` +
          `*MA:* Tersusun bearish ✅\n` +
          `*MACD:* ${macdValue.toFixed(4)} < ${signalValue.toFixed(
            4
          )} (Cross Down ❌)\n\n` +
          `🚫 Hindari entry buy saat ini.`
      );
    }
  } catch (error) {
    console.error("checkSignal error:", error.message || error);
  }
}

// === Eksekusi Tiap 15 Menit di Quarter Hour ===
function waitUntilNextQuarterHour() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms =
    ((15 - (minutes % 15)) % 15) * 60 * 1000 - seconds * 1000;

  console.log(
    `XAUUSD: Menunggu ${Math.ceil(ms / 1000)} detik hingga kuartal berikutnya...`
  );

  setTimeout(() => {
    checkSignal().catch((e) => console.error(e));

    // eksekusi tiap 15 menit selanjutnya
    setInterval(() => checkSignal().catch((e) => console.error(e)), 15 * 60 * 1000);
  }, ms);
}

// === Mulai Bot ===
waitUntilNextQuarterHour();

