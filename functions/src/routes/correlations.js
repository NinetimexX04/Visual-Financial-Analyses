const express = require('express');
const router = express.Router();
const { calculateCorrelationMatrix } = require('../services/correlations');
const { getFromS3, saveToS3 } = require('../services/s3');

const CORRELATION_CACHE_KEY = 'correlations/matrix.json';
const CACHE_DURATION_HOURS = 24;

router.get('/', async (req, res) => {
  try {
    console.log('Fetching correlation data...');
    
    const cached = await getFromS3(CORRELATION_CACHE_KEY);
    
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
    
    const correlations = await calculateCorrelationMatrix();
    
    await saveToS3(CORRELATION_CACHE_KEY, correlations);
    
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
    console.log('Force refreshing correlations...');
    
    const correlations = await calculateCorrelationMatrix();
    await saveToS3(CORRELATION_CACHE_KEY, correlations);
    
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