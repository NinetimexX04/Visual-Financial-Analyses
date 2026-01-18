const axios = require('axios');

const TECH_STOCKS = ["AAPL", "GOOGL", "NVDA", "MSFT", "AMZN", "META", "TSLA", "NFLX", "AMD", "INTC"];

async function getCurrentPrices() {
  try {
    const results = await Promise.all(
      TECH_STOCKS.map(async (ticker) => {
        const response = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`
        );
        
        const meta = response.data.chart.result[0].meta;
        
        return {
          ticker: ticker,
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose,
          change: meta.regularMarketPrice - meta.chartPreviousClose,
          changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
        };
      })
    );
    
    return results;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw error;
  }
}

// Test code
if (require.main === module) {
  getCurrentPrices()
    .then(data => console.log('Stock data:', data))
    .catch(error => console.error('Error:', error));
}

module.exports = { getCurrentPrices, TECH_STOCKS };