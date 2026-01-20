const express = require('express');
const router = express.Router();
const { getCurrentPrices, DEFAULT_STOCKS } = require('../services/stockData');
const { getStockSentiment } = require('../services/newsAnalysis');
const { getFromS3, saveToS3 } = require('../services/s3');

const CACHE_DURATION_HOURS = 4;

/**
 * GET /api/stocks
 * Fetches current prices for given tickers (or defaults)
 */
router.get('/', async (req, res) => {
  try {
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
 * Returns AI-powered sentiment analysis for given tickers
 * Uses S3 caching to reduce API costs
 */
router.get('/sentiment', async (req, res) => {
  try {
    console.log('Fetching sentiment data...');

    // Get tickers from query param
    const tickersParam = req.query.tickers;
    const tickers = tickersParam
      ? tickersParam.split(',').map(t => t.trim().toUpperCase())
      : DEFAULT_STOCKS;

    console.log(`Sentiment requested for: ${tickers.join(', ')}`);

    // Create cache key based on sorted tickers
    const cacheKey = `sentiment/${[...tickers].sort().join('-')}.json`;

    const cached = await getFromS3(cacheKey);

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
      } else {
        console.log('○ Sentiment cache expired, analyzing fresh...');
      }
    } else {
      console.log('○ No sentiment cache found, analyzing...');
    }

    // Calculate fresh sentiment
    console.log(`Analyzing sentiment for ${tickers.length} stocks (this may take a while)...`);

    const sentiments = await Promise.all(
      tickers.map(ticker => getStockSentiment(ticker))
    );

    const result = {
      sentiments,
      timestamp: new Date().toISOString()
    };

    // Save to S3 cache
    await saveToS3(cacheKey, result);
    console.log('✓ Saved sentiment to cache');

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
 */
router.post('/sentiment/refresh', async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TICKERS',
          message: 'Please provide an array of tickers'
        }
      });
    }

    console.log(`Force refreshing sentiment for: ${tickers.join(', ')}`);

    const sentiments = await Promise.all(
      tickers.map(ticker => getStockSentiment(ticker))
    );

    const result = {
      sentiments,
      timestamp: new Date().toISOString()
    };

    // Save to S3 cache
    const cacheKey = `sentiment/${[...tickers].sort().join('-')}.json`;
    await saveToS3(cacheKey, result);

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