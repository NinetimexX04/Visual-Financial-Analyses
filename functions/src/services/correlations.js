const axios = require('axios');
const ss = require('simple-statistics');

async function getHistoricalPrices(ticker, days = 60) {
  try {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (days * 24 * 60 * 60);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${startDate}&period2=${endDate}`;
    
    const response = await axios.get(url);
    const result = response.data.chart.result[0];
    const closePrices = result.indicators.quote[0].close;
    
    return closePrices.filter(price => price !== null);
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error.message);
    throw error;
  }
}

function calculateCorrelation(pricesA, pricesB) {
  const minLength = Math.min(pricesA.length, pricesB.length);
  const trimmedA = pricesA.slice(-minLength);
  const trimmedB = pricesB.slice(-minLength);
  return ss.sampleCorrelation(trimmedA, trimmedB);
}

async function calculateCorrelationMatrix(tickers) {
  try {
    console.log(`Fetching historical data for ${tickers.length} stocks...`);
    
    const historicalData = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const prices = await getHistoricalPrices(ticker, 60);
          return { ticker, prices };
        } catch (err) {
          console.error(`Failed to get history for ${ticker}:`, err.message);
          return { ticker, prices: [] };
        }
      })
    );

    // Filter out stocks with insufficient price data
    const validData = historicalData.filter(d => d.prices.length > 10);
    
    console.log(`Calculating correlations for ${validData.length} stocks...`);

    // Build correlation matrix
    const matrix = [];
    for (let i = 0; i < validData.length; i++) {
      const row = [];
      for (let j = 0; j < validData.length; j++) {
        if (i === j) {
          row.push(1.0);
        } else {
          const correlation = calculateCorrelation(
            validData[i].prices,
            validData[j].prices
          );
          row.push(correlation);
        }
      }
      matrix.push(row);
    }

    // Build edges - connect ALL stocks above threshold
    const edges = [];
    const CORRELATION_THRESHOLD = 0.6; // Adjust as needed
    
    for (let i = 0; i < validData.length; i++) {
      for (let j = i + 1; j < validData.length; j++) {
        const correlation = matrix[i][j];
        
        if (correlation > CORRELATION_THRESHOLD) {
          edges.push({
            source: validData[i].ticker,
            target: validData[j].ticker,
            correlation: Math.round(correlation * 100) / 100
          });
        }
      }
    }

    const validTickers = validData.map(d => d.ticker);
    
    console.log(`Generated ${edges.length} edges from ${validTickers.length} stocks`);

    return {
      stocks: validTickers,
      matrix: matrix,
      edges: edges,
      calculatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error calculating correlation matrix:', error);
    throw error;
  }
}

module.exports = {
  getHistoricalPrices,
  calculateCorrelation,
  calculateCorrelationMatrix
};