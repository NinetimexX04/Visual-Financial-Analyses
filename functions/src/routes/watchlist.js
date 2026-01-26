const express = require('express');
const router = express.Router();
const { dynamodb } = require('../config/aws');
const admin = require('firebase-admin');

const TABLE_NAME = process.env.DDB_TABLE_NAME || 'Users';

// Default watchlist for new users
const DEFAULT_WATCHLISTS = {
  'Default': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE', 'NFLX', 'CSCO', 'QCOM', 'IBM', 'AVGO', 'TXN', 'MU', 'UBER']
};
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' }
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    req.uid = decodedToken.uid;
    next();

  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
    });
  }
}

router.use(verifyToken);

/**
 * GET /watchlist
 * Returns all watchlists for the user
 */
router.get('/', async (req, res) => {
  try {
    const uid = req.uid;
    console.log(`Fetching watchlists for user: ${uid}`);

    const params = {
      TableName: TABLE_NAME,
      Key: { uid }
    };

    const result = await dynamodb.get(params).promise();

    if (!result.Item || !result.Item.watchlists) {
      // Return default watchlists for new users
      return res.json({
        uid,
        watchlists: DEFAULT_WATCHLISTS,
        activeWatchlist: 'Default',
        updatedAt: null
      });
    }

    res.json({
      uid: result.Item.uid,
      watchlists: result.Item.watchlists || DEFAULT_WATCHLISTS,
      activeWatchlist: result.Item.activeWatchlist || 'Default',
      updatedAt: result.Item.updatedAt
    });

  } catch (error) {
    console.error('Error fetching watchlists:', error);
    res.status(500).json({
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch watchlists'
      }
    });
  }
});

/**
 * POST /watchlist
 * Save all watchlists and active watchlist
 */
router.post('/', async (req, res) => {
  try {
    const uid = req.uid;
    const { watchlists, activeWatchlist } = req.body;

    if (!watchlists || typeof watchlists !== 'object') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'watchlists must be an object'
        }
      });
    }

    console.log(`Saving watchlists for user: ${uid}`);

    const params = {
      TableName: TABLE_NAME,
      Key: { uid },
      UpdateExpression: 'SET watchlists = :watchlists, activeWatchlist = :activeWatchlist, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':watchlists': watchlists,
        ':activeWatchlist': activeWatchlist || 'Default',
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(params).promise();

    res.json({
      uid: result.Attributes.uid,
      watchlists: result.Attributes.watchlists,
      activeWatchlist: result.Attributes.activeWatchlist,
      updatedAt: result.Attributes.updatedAt
    });

  } catch (error) {
    console.error('Error saving watchlists:', error);
    res.status(500).json({
      error: {
        code: 'SAVE_ERROR',
        message: 'Failed to save watchlists'
      }
    });
  }
});

/**
 * DELETE /watchlist/:name
 * Delete a specific watchlist
 */
router.delete('/:name', async (req, res) => {
  try {
    const uid = req.uid;
    const watchlistName = decodeURIComponent(req.params.name);

    console.log(`Deleting watchlist "${watchlistName}" for user: ${uid}`);

    // First get current watchlists
    const getParams = {
      TableName: TABLE_NAME,
      Key: { uid }
    };

    const result = await dynamodb.get(getParams).promise();
    const watchlists = result.Item?.watchlists || DEFAULT_WATCHLISTS;

    if (!watchlists[watchlistName]) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Watchlist "${watchlistName}" not found`
        }
      });
    }

    // Remove the watchlist
    delete watchlists[watchlistName];

    // If no watchlists left, add default back
    if (Object.keys(watchlists).length === 0) {
      watchlists['Default'] = [];
    }

    // Determine new active watchlist
    const currentActive = result.Item?.activeWatchlist;
    const newActive = currentActive === watchlistName
      ? Object.keys(watchlists)[0]
      : currentActive;

    const updateParams = {
      TableName: TABLE_NAME,
      Key: { uid },
      UpdateExpression: 'SET watchlists = :watchlists, activeWatchlist = :activeWatchlist, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':watchlists': watchlists,
        ':activeWatchlist': newActive,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    const updateResult = await dynamodb.update(updateParams).promise();

    res.json({
      success: true,
      message: `Watchlist "${watchlistName}" deleted`,
      watchlists: updateResult.Attributes.watchlists,
      activeWatchlist: updateResult.Attributes.activeWatchlist
    });

  } catch (error) {
    console.error('Error deleting watchlist:', error);
    res.status(500).json({
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete watchlist'
      }
    });
  }
});

module.exports = router;
