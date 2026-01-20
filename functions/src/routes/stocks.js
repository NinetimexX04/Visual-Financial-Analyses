const express = require('express');
const router = express.Router();
const { getCurrentPrices, DEFAULT_STOCKS } = require('../services/stockData');
const { getStockSentiment } = require('../services/newsAnalysis');
const { getFromS3, saveToS3 } = require('../services/s3');

const SENTIMENT_CACHE_KEY = 'sentiment/analysis.json';
const CACHE_DURATION_HOURS = 4;

/**
 * GET /api/stocks
 * Fetches current prices for given tickers (or defaults)
 */
router.get('/', async (req, res) => {
  try {
    // Get tickers from query param, fallback to defaults
    const tickersParam = req.query.tickers;
    const tickers = tickersParam
      ? tickersParam.split(',').map(t => t.trim().toUpperCase())
      : DEFAULT_STOCKS;

    console.log(`Fetching prices for: ${tickers.join(', ')}`);

    const stocks = await getCurrentPrices(tickers);

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
 * Validates a single ticker against Yahoo Finance
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
 * Returns cached sentiment analysis
 */
router.get('/sentiment', async (req, res) => {
  try {
    console.log('Fetching sentiment data...');

    const cached = await getFromS3(SENTIMENT_CACHE_KEY);

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
      const maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;

      if (cacheAge < maxAge) {
        console.log(`✓ Using cached sentiment (${Math.round(cacheAge / 60000)} minutes old)`);
        return res.json({
          ...cached,
          fromCache: true,
          cacheAge: Math.round(cacheAge / 60000)
        });
      }
    }

    // For now, return empty if no cache (sentiment is expensive)
    // You can implement real sentiment later
    console.log('No valid sentiment cache, returning empty');
    res.json({
      sentiments: [],
      timestamp: new Date().toISOString(),
      fromCache: false
    });

  } catch (error) {
    console.error('Error in /stocks/sentiment:', error);
    res.status(500).json({
      error: {
        code: 'SENTIMENT_ERROR',
        message: 'Failed to fetch sentiment'
      }
    });
  }
});

/**
 * POST /api/stocks/sentiment/refresh
 * Force refresh sentiment (placeholder for now)
 */
router.post('/sentiment/refresh', async (req, res) => {
  try {
    console.log('Sentiment refresh requested (not implemented yet)');

    res.json({
      sentiments: [],
      timestamp: new Date().toISOString(),
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