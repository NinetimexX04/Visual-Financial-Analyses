const express = require('express');
const router = express.Router();
const { getCurrentPrices, ALL_STOCKS } = require('../services/stockData');
const { getStockSentiment } = require('../services/newsAnalysis');
const { getFromS3, saveToS3 } = require('../services/s3');

const SENTIMENT_CACHE_KEY = 'sentiment/analysis.json';
const CACHE_DURATION_HOURS = 4; // Refresh sentiment every 4 hours

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

/**
 * GET /api/stocks/lookup/:ticker
 * Validates and fetches data for a single ticker from Yahoo Finance
 */
router.get('/lookup/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase().trim();

  if (!ticker || ticker.length > 10) {
    return res.status(400).json({
      error: {
        code: 'INVALID_TICKER',
        message: 'Please enter a valid ticker symbol'
      }
    });
  }

  try {
    const axios = require('axios');
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
      { timeout: 5000 }
    );

    const result = response.data.chart.result;
    if (!result || !result[0] || !result[0].meta) {
      return res.status(404).json({
        error: {
          code: 'TICKER_NOT_FOUND',
          message: `Ticker "${ticker}" not found`
        }
      });
    }

    const meta = result[0].meta;

    res.json({
      ticker: meta.symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose,
      change: meta.regularMarketPrice - meta.chartPreviousClose,
      changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
      valid: true
    });

  } catch (error) {
    console.error(`Error looking up ticker ${ticker}:`, error.message);

    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        error: {
          code: 'TICKER_NOT_FOUND',
          message: `Ticker "${ticker}" not found`
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'LOOKUP_ERROR',
        message: `Failed to look up ticker "${ticker}"`
      }
    });
  }
});

/**
 * GET /api/stocks/sentiment
 * Returns AI-powered sentiment analysis for all tech stocks
 * Uses S3 caching to reduce API costs and rate limits
 */
router.get('/sentiment', async (req, res) => {
  try {
    console.log('Fetching sentiment data...');
    
    // Try to get cached version from S3
    const cached = await getFromS3(SENTIMENT_CACHE_KEY);
    
    if (cached) {
      // Check if cache is still fresh
      const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
      const maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;
      
      if (cacheAge < maxAge) {
        console.log(`✓ Using cached sentiment (${Math.round(cacheAge / 60000)} minutes old)`);
        return res.json({
          ...cached,
          fromCache: true,
          cacheAge: Math.round(cacheAge / 60000) // minutes
        });
      } else {
        console.log('○ Sentiment cache expired, analyzing fresh data...');
      }
    } else {
      console.log('○ No sentiment cache found, analyzing...');
    }
    
    // Calculate fresh sentiment data
    // This is expensive: 10 stocks × NewsAPI × Claude API
    console.log('Analyzing sentiment for all stocks (this may take 20-30 seconds)...');
    
    const sentiments = await Promise.all(
      ALL_STOCKS.map(ticker => getStockSentiment(ticker))
    );
    
    const result = {
      sentiments,
      timestamp: new Date().toISOString()
    };
    
    // Save to S3 for next time
    await saveToS3(SENTIMENT_CACHE_KEY, result);
    console.log(`✓ Saved sentiment to cache, valid for ${CACHE_DURATION_HOURS} hours`);
    
    res.json({
      ...result,
      fromCache: false
    });
    
  } catch (error) {
    console.error('Error in /stocks/sentiment:', error);
    res.status(500).json({
      error: {
        code: 'SENTIMENT_ERROR',
        message: 'Failed to analyze sentiment',
        details: error.message
      }
    });
  }
});

/**
 * POST /api/stocks/sentiment/refresh
 * Force refresh sentiment analysis (ignores cache)
 * Useful for manual refresh button
 */
router.post('/sentiment/refresh', async (req, res) => {
  try {
    console.log('Force refreshing sentiment analysis...');
    
    const sentiments = await Promise.all(
      ALL_STOCKS.map(ticker => getStockSentiment(ticker))
    );
    
    const result = {
      sentiments,
      timestamp: new Date().toISOString()
    };
    
    await saveToS3(SENTIMENT_CACHE_KEY, result);
    
    res.json({
      ...result,
      fromCache: false,
      refreshed: true
    });
    
  } catch (error) {
    console.error('Error refreshing sentiment:', error);
    res.status(500).json({
      error: {
        code: 'REFRESH_ERROR',
        message: 'Failed to refresh sentiment'
      }
    });
  }
});

module.exports = router;