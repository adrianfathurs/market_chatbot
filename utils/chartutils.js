const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data"); // ✅ Tambahan penting
const { RSI, MACD } = require("technicalindicators");

const width = 800;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

async function generateChart(prices) {
  const labels = prices.map((_, i) => i);

  const rsi = RSI.calculate({ period: 14, values: prices });
  const macdData = MACD.calculate({
    values: prices,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const rsiTrimmed = Array(prices.length - rsi.length).fill(null).concat(rsi);
  const macd = Array(prices.length - macdData.length).fill(null).concat(macdData.map(d => d.MACD));
  const signal = Array(prices.length - macdData.length).fill(null).concat(macdData.map(d => d.signal));

  const configuration = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Price",
          data: prices,
          borderColor: "gold",
          fill: false,
        },
        {
          label: "RSI",
          data: rsiTrimmed,
          borderColor: "purple",
          fill: false,
          yAxisID: 'rsi-axis',
        },
        {
          label: "MACD",
          data: macd,
          borderColor: "green",
          fill: false,
          yAxisID: 'macd-axis',
        },
        {
          label: "Signal",
          data: signal,
          borderColor: "red",
          borderDash: [5, 5],
          fill: false,
          yAxisID: 'macd-axis',
        },
      ],
    },
    options: {
      responsive: false,
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'Price' },
        },
        'rsi-axis': {
          position: 'right',
          min: 0,
          max: 100,
          ticks: { stepSize: 20 },
          grid: { drawOnChartArea: false },
        },
        'macd-axis': {
          position: 'right',
          grid: { drawOnChartArea: false },
        },
      },
    },
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  const filename = `./chart_${Date.now()}.png`;
  fs.writeFileSync(filename, buffer);
  return filename;
}

async function sendImageToTelegram(imagePath, caption, botToken, chatId) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("photo", fs.createReadStream(imagePath));

  await axios.post(url, form, {
    headers: form.getHeaders(),
  });
}

module.exports = { generateChart, sendImageToTelegram };
