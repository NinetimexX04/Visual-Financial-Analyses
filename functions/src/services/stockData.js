const axios = require('axios');

// Diversified stock list across multiple sectors
const STOCKS = {
  // Technology
  tech: ["AAPL", "GOOGL", "NVDA", "MSFT", "AMZN", "META", "TSLA", "AMD"],
  // Energy
  energy: ["XOM", "CVX", "COP", "SLB", "OXY"],
  // Finance
  finance: ["JPM", "BAC", "GS", "V", "MA"],
  // Healthcare
  healthcare: ["JNJ", "PFE", "UNH", "MRK", "ABBV"],
  // Consumer
  consumer: ["WMT", "KO", "PEP", "MCD", "NKE"],
};

// Flatten all stocks into single array
const ALL_STOCKS = Object.values(STOCKS).flat();

async function getCurrentPrices() {
  try {
    const results = await Promise.all(
      ALL_STOCKS.map(async (ticker) => {
        try {
          const response = await axios.get(
            `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
            { timeout: 5000 }
          );

          const meta = response.data.chart.result[0].meta;

          return {
            ticker: ticker,
            price: meta.regularMarketPrice,
            previousClose: meta.chartPreviousClose,
            change: meta.regularMarketPrice - meta.chartPreviousClose,
            changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
            sector: getSector(ticker)
          };
        } catch (err) {
          console.error(`Failed to fetch ${ticker}:`, err.message);
          // Return mock data if fetch fails
          return {
            ticker: ticker,
            price: 100 + Math.random() * 200,
            previousClose: 100 + Math.random() * 200,
            change: (Math.random() - 0.5) * 10,
            changePercent: (Math.random() - 0.5) * 5,
            sector: getSector(ticker)
          };
        }
      })
    );

    return results;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
}

function getSector(ticker) {
  for (const [sector, tickers] of Object.entries(STOCKS)) {
    if (tickers.includes(ticker)) return sector;
  }
  return 'unknown';
}

module.exports = { getCurrentPrices, ALL_STOCKS, STOCKS };
