const axios = require('axios');
const ss = require('simple-statistics');
const { ALL_STOCKS, STOCKS } = require('./stockData');

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

// Helper to get sector for a ticker
function getSector(ticker) {
  for (const [sector, tickers] of Object.entries(STOCKS)) {
    if (tickers.includes(ticker)) return sector;
  }
  return 'unknown';
}

async function calculateCorrelationMatrix() {
  try {
    console.log('Fetching historical data for all stocks...');

    const historicalData = await Promise.all(
      ALL_STOCKS.map(async (ticker) => {
        try {
          const prices = await getHistoricalPrices(ticker, 60);
          return { ticker, prices, sector: getSector(ticker) };
        } catch (err) {
          console.error(`Failed to get history for ${ticker}:`, err.message);
          return { ticker, prices: [], sector: getSector(ticker) };
        }
      })
    );

    // Filter out stocks with no price data
    const validData = historicalData.filter(d => d.prices.length > 10);

    console.log(`Calculating correlations for ${validData.length} stocks...`);

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

    const edges = [];
    const validTickers = validData.map(d => d.ticker);

    // Only create edges WITHIN the same sector
    for (let i = 0; i < validData.length; i++) {
      for (let j = i + 1; j < validData.length; j++) {
        const sectorA = validData[i].sector;
        const sectorB = validData[j].sector;

        // Only connect stocks in the same sector
        if (sectorA !== sectorB) continue;

        const correlation = matrix[i][j];

        // Higher threshold within sectors for cleaner graph
        if (correlation > 0.6) {
          edges.push({
            source: validData[i].ticker,
            target: validData[j].ticker,
            correlation: Math.round(correlation * 100) / 100,
            sector: sectorA
          });
        }
      }
    }

    return {
      stocks: validTickers,
      sectors: STOCKS,
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