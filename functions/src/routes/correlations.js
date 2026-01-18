const express = require('express');
const router = express.Router();
const { calculateCorrelationMatrix } = require('../services/correlations');
const { getFromS3, saveToS3 } = require('../services/s3');

const CORRELATION_CACHE_KEY = 'correlations/matrix.json';
const CACHE_DURATION_HOURS = 24;

/**
 * GET /api/correlations
 * Returns correlation matrix for tech stocks
 * Uses cached version if available and fresh (< 24 hours old)
 * Otherwise calculates new matrix and caches it
 * 
 * Response example:
 * {
 *   stocks: ["AAPL", "GOOGL", ...],
 *   edges: [
 *     { source: "AAPL", target: "GOOGL", correlation: 0.85 },
 *     ...
 *   ],
 *   calculatedAt: "2025-01-17T10:00:00.000Z",
 *   fromCache: true
 * }
 */
router.get('/', async (req, res) => {
  try {
    console.log('Fetching correlation data...');
    
    // Try to get cached version from S3
    const cached = await getFromS3(CORRELATION_CACHE_KEY);
    
    if (cached) {
      // Check if cache is still fresh
      const cacheAge = Date.now() - new Date(cached.calculatedAt).getTime();
      const maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000; // Convert hours to milliseconds
      
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
    
    // Calculate fresh correlations
    const correlations = await calculateCorrelationMatrix();
    
    // Save to S3 for next time
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

/**
 * POST /api/correlations/refresh
 * Force recalculation of correlations (ignores cache)
 * Useful for testing or manual refresh
 */
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