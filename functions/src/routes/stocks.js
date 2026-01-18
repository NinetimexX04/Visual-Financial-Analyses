const express = require('express');
const router = express.Router();
const { getCurrentPrices } = require('../services/stockData');

/**
 * GET /api/stocks
 * Returns current prices for all tech stocks
 * 
 * Response example:
 * {
 *   stocks: [
 *     { ticker: "AAPL", price: 255.53, change: -2.68, changePercent: -1.04 },
 *     ...
 *   ],
 *   timestamp: "2025-01-17T18:30:00.000Z"
 * }
 */
router.get('/', async (req, res) => {
  try {
    console.log('Fetching current stock prices...');
    
    const stocks = await getCurrentPrices();
    
    res.json({
      stocks: stocks,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in /stocks:', error);
    res.status(500).json({
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch stock data'
      }
    });
  }
});

module.exports = router;