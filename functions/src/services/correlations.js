const axios = require('axios');
const ss = require('simple-statistics');
const { TECH_STOCKS } = require('./stockData');

/**
 * Fetch historical prices for a single stock
 * @param {string} ticker - Stock symbol like "AAPL"
 * @param {number} days - Number of days of history (default 60)
 * @returns {Array} - Array of closing prices [100.5, 101.2, 99.8, ...]
 */
async function getHistoricalPrices(ticker, days = 60) {
  try {
    // Calculate timestamp for 'days' ago
    const endDate = Math.floor(Date.now() / 1000); // Current time in seconds
    const startDate = endDate - (days * 24 * 60 * 60); // 'days' ago in seconds
    
    // Yahoo Finance historical data endpoint
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${startDate}&period2=${endDate}`;
    
    const response = await axios.get(url);
    const result = response.data.chart.result[0];
    
    // Extract just the closing prices from the response
    const closePrices = result.indicators.quote[0].close;
    
    // Filter out any null values (market closed days, etc.)
    return closePrices.filter(price => price !== null);
    
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error.message);
    throw error;
  }
}

/**
 * Calculate Pearson correlation coefficient between two price arrays
 * @param {Array} pricesA - Array of prices for stock A
 * @param {Array} pricesB - Array of prices for stock B
 * @returns {number} - Correlation coefficient between -1 and 1
 * 
 * HOW IT WORKS:
 * - Compares how two stocks move relative to each other
 * - +1 = perfect positive correlation (always move together)
 * - 0 = no correlation (independent)
 * - -1 = perfect negative correlation (move opposite directions)
 */
function calculateCorrelation(pricesA, pricesB) {
  // Make sure both arrays are the same length
  const minLength = Math.min(pricesA.length, pricesB.length);
  const trimmedA = pricesA.slice(-minLength);
  const trimmedB = pricesB.slice(-minLength);
  
  // Use simple-statistics library to calculate Pearson correlation
  return ss.sampleCorrelation(trimmedA, trimmedB);
}

/**
 * Calculate correlation matrix for all tech stocks
 * @returns {Object} - Correlation data structure
 * 
 * WHAT THIS RETURNS:
 * {
 *   stocks: ["AAPL", "GOOGL", "NVDA", ...],
 *   matrix: [
 *     [1.0, 0.85, 0.72, ...],  // AAPL vs all stocks
 *     [0.85, 1.0, 0.68, ...],  // GOOGL vs all stocks
 *     ...
 *   ],
 *   edges: [
 *     { source: "AAPL", target: "GOOGL", correlation: 0.85 },
 *     { source: "AAPL", target: "NVDA", correlation: 0.72 },
 *     ...
 *   ]
 * }
 */
async function calculateCorrelationMatrix() {
  try {
    console.log('Fetching historical data for all stocks...');
    
    // Step 1: Fetch 60 days of prices for ALL stocks in parallel
    const historicalData = await Promise.all(
      TECH_STOCKS.map(async (ticker) => {
        const prices = await getHistoricalPrices(ticker, 60);
        return { ticker, prices };
      })
    );
    
    console.log('Calculating correlations...');
    
    // Step 2: Build correlation matrix
    // This is a 2D array where matrix[i][j] = correlation between stock i and stock j
    const matrix = [];
    
    for (let i = 0; i < historicalData.length; i++) {
      const row = [];
      
      for (let j = 0; j < historicalData.length; j++) {
        if (i === j) {
          // A stock is always perfectly correlated with itself
          row.push(1.0);
        } else {
          // Calculate correlation between stock i and stock j
          const correlation = calculateCorrelation(
            historicalData[i].prices,
            historicalData[j].prices
          );
          row.push(correlation);
        }
      }
      
      matrix.push(row);
    }
    
    // Step 3: Convert matrix to edge list for graph visualization
    // Only include edges where correlation > 0.5 (moderate to strong correlation)
    const edges = [];
    
    for (let i = 0; i < TECH_STOCKS.length; i++) {
      for (let j = i + 1; j < TECH_STOCKS.length; j++) {
        // j starts at i+1 to avoid duplicate edges (A->B and B->A)
        const correlation = matrix[i][j];
        
        if (correlation > 0.5) {
          edges.push({
            source: TECH_STOCKS[i],
            target: TECH_STOCKS[j],
            correlation: Math.round(correlation * 100) / 100 // Round to 2 decimals
          });
        }
      }
    }
    
    return {
      stocks: TECH_STOCKS,
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

// Test code
if (require.main === module) {
  calculateCorrelationMatrix()
    .then(result => {
      console.log('\n=== CORRELATION MATRIX ===');
      console.log('Stocks:', result.stocks);
      console.log('\nMatrix:', result.matrix);
      console.log('\n=== EDGES (correlation > 0.5) ===');
      console.log(result.edges);
    })
    .catch(error => console.error('Error:', error));
}