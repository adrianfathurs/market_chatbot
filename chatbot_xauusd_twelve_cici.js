require("dotenv").config();
const axios = require("axios");
const { CCI } = require("technicalindicators");
const ExcelJS = require("exceljs");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

// ==============================
// TELEGRAM
// ==============================

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ==============================
// API
// ==============================

const API_KEY = process.env.TWELVE_DATA_API_KEY;

// ==============================
// STORAGE
// ==============================

let signalLogs = [];
let lastSignalTime = null;
let exportedToday = false;

// ==============================
// SEND TELEGRAM MESSAGE
// ==============================

async function sendTelegram(msg) {
  try {

    await axios.post(`${TELEGRAM_BASE}/sendMessage`, {
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
// SEND FILE TELEGRAM
// ==============================

async function sendTelegramFile(filePath) {

  try {

    console.log("Mengirim file:", filePath);

    const form = new FormData();

    form.append("chat_id", CHAT_ID);
    form.append("document", fs.createReadStream(filePath));

    const res = await axios.post(
      `${TELEGRAM_BASE}/sendDocument`,
      form,
      {
        headers: form.getHeaders()
      }
    );

    console.log("✔ Excel terkirim ke Telegram");
    console.log(res.data);

  } catch (err) {

    console.log("Upload error:", err.response?.data || err.message);

  }

}

// ==============================
// FETCH MARKET DATA
// ==============================

async function fetchData() {

  try {

    const url =
      `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1min&outputsize=200&apikey=${API_KEY}`;

    const res = await axios.get(url);

    if (!res.data.values) return null;

    return res.data.values.reverse().map(d => ({
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      time: d.datetime
    }));

  } catch (err) {

    console.log("API error:", err.message);
    return null;

  }

}

// ==============================
// CHECK CCI SIGNAL
// ==============================

async function checkSignal() {

  const candles = await fetchData();
  if (!candles) return;

  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);

  const last = candles.at(-1);

  if (lastSignalTime === last.time) return;

  const cci = CCI.calculate({
    high,
    low,
    close,
    period: 20
  });

  if (!cci.length) return;

  const CCI_VALUE = cci.at(-1);

  if (CCI_VALUE < -100) {

    lastSignalTime = last.time;

    const price = last.close.toFixed(2);
    const cciValue = CCI_VALUE.toFixed(2);

    signalLogs.push({
      time: last.time,
      price: price,
      cci: cciValue
    });

    sendTelegram(
`🚨 <b>CICI MEMENUHI SYARAT GUYS</b> 🚨

Price : ${price}
CCI   : ${cciValue}`
    );

  }

}

// ==============================
// CREATE EXCEL
// ==============================

async function createExcel() {

  try {

    if (signalLogs.length === 0) {

      console.log("Tidak ada signal hari ini");
      return;

    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("CICI SIGNAL");

    sheet.columns = [
      { header: "Time", key: "time", width: 25 },
      { header: "Price", key: "price", width: 15 },
      { header: "CCI", key: "cci", width: 15 }
    ];

    signalLogs.forEach(row => {
      sheet.addRow(row);
    });

    const fileName = `CICI_SIGNAL_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, fileName);

    await workbook.xlsx.writeFile(filePath);

    console.log("✔ Excel dibuat:", filePath);

    await sendTelegramFile(filePath);

    signalLogs = [];

  } catch (err) {

    console.log("Excel error:", err.message);

  }

}

// ==============================
// CHECK EXPORT TIME
// ==============================

function checkExportTime() {

  const now = new Date();

  console.log("Check time:", now.toLocaleTimeString());

  if (now.getHours() === 21 && now.getMinutes() === 0 && !exportedToday) {

    console.log("⏰ Waktu export Excel");

    exportedToday = true;

    createExcel();

  }

  if (now.getHours() === 0 && now.getMinutes() === 1) {

    exportedToday = false;

  }

}

// ==============================
// RUN BOT
// ==============================

setInterval(checkSignal, 60 * 1000);
setInterval(checkExportTime, 60 * 1000);

console.log("🤖 CICI BOT + REKAP EXCEL RUNNING");