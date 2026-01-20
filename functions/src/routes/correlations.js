const express = require('express');
const router = express.Router();
const { calculateCorrelationMatrix } = require('../services/correlations');
const { getFromS3, saveToS3 } = require('../services/s3');

const CACHE_DURATION_HOURS = 24;

// Helper to create a cache key from tickers
function getCacheKey(tickers) {
  const sorted = [...tickers].sort().join('-');
  return `correlations/${sorted}.json`;
}

router.get('/', async (req, res) => {
  try {
    // Get tickers from query param
    const tickersParam = req.query.tickers;
    
    if (!tickersParam) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TICKERS',
          message: 'Please provide tickers as a query parameter'
        }
      });
    }
    
    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase());
    
    if (tickers.length < 2) {
      return res.status(400).json({
        error: {
          code: 'INSUFFICIENT_TICKERS',
          message: 'Need at least 2 tickers to calculate correlations'
        }
      });
    }
    
    console.log(`Fetching correlations for ${tickers.length} tickers:`, tickers);
    
    const cacheKey = getCacheKey(tickers);
    const cached = await getFromS3(cacheKey);
    
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.calculatedAt).getTime();
      const maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;
      
      if (cacheAge < maxAge) {
        console.log('✓ Using cached correlations');
        return res.json({
          ...cached,
          fromCache: true
        });
      } else {
        console.log('○ Cache expired, recalculating...');
      }
    } else {
      console.log('○ No cache found, calculating...');
    }

    const correlations = await calculateCorrelationMatrix(tickers);
    
    await saveToS3(cacheKey, correlations);

    res.json({
      ...correlations,
      fromCache: false
    });

  } catch (error) {
    console.error('Error in /correlations:', error);
    res.status(500).json({
      error: {
        code: 'CORRELATION_ERROR',
        message: 'Failed to calculate correlations'
      }
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { tickers } = req.body;
    
    if (!tickers || !Array.isArray(tickers) || tickers.length < 2) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TICKERS',
          message: 'Please provide an array of at least 2 tickers'
        }
      });
    }
    
    console.log('Force refreshing correlations for:', tickers);
    
    const correlations = await calculateCorrelationMatrix(tickers);
    
    const cacheKey = getCacheKey(tickers);
    await saveToS3(cacheKey, correlations);

    res.json({
      ...correlations,
      fromCache: false,
      refreshed: true
    });

  } catch (error) {
    console.error('Error refreshing correlations:', error);
    res.status(500).json({
      error: {
        code: 'REFRESH_ERROR',
        message: 'Failed to refresh correlations'
      }
    });
  }
});

module.exports = router;
