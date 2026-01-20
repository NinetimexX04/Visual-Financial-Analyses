const axios = require('axios');

// Default stocks (used if no tickers provided)
const DEFAULT_STOCKS = ['AAPL', 'NVDA', 'GOOGL', 'MSFT', 'AMZN', 'META', 'TSLA'];

async function getCurrentPrices(tickers = DEFAULT_STOCKS) {
  try {
    console.log(`Fetching prices for ${tickers.length} stocks:`, tickers);

    const results = await Promise.all(
      tickers.map(async (ticker) => {
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
            changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
          };
        } catch (err) {
          console.error(`Failed to fetch ${ticker}:`, err.message);
          return null;
        }
      })
    );

    // Filter out failed fetches
    return results.filter(r => r !== null);

  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
}

module.exports = { getCurrentPrices, DEFAULT_STOCKS };