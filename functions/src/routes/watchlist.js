const express = require('express');
const router = express.Router();
const { dynamodb } = require('../config/aws');

const TABLE_NAME = process.env.DDB_TABLE_NAME || 'UserWatchlists';

/**
 * Middleware to extract user ID from request
 * In production, this would verify Firebase auth token
 * For now, we'll use a mock user ID for testing
 * 
 * TODO: Add Firebase auth verification
 */
function getUserId(req) {
  // For testing, use a mock user ID
  // In production, extract from verified Firebase token
  return req.headers['x-user-id'] || 'test-user-123';
}

/**
 * GET /api/watchlist
 * Get user's saved watchlist from DynamoDB
 * 
 * Response example:
 * {
 *   uid: "user123",
 *   watchlist: ["AAPL", "GOOGL", "NVDA"],
 *   updatedAt: 1705512000000
 * }
 */
router.get('/', async (req, res) => {
  try {
    const uid = getUserId(req);
    console.log(`Fetching watchlist for user: ${uid}`);
    
    const params = {
      TableName: TABLE_NAME,
      Key: { uid }
    };
    
    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
      // User has no watchlist yet, return empty
      return res.json({
        uid,
        watchlist: [],
        updatedAt: null
      });
    }
    
    res.json(result.Item);
    
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch watchlist'
      }
    });
  }
});

/**
 * POST /api/watchlist
 * Save user's watchlist to DynamoDB
 * 
 * Request body:
 * {
 *   watchlist: ["AAPL", "GOOGL", "NVDA"]
 * }
 * 
 * Response:
 * {
 *   uid: "user123",
 *   watchlist: ["AAPL", "GOOGL", "NVDA"],
 *   updatedAt: 1705512000000
 * }
 */
router.post('/', async (req, res) => {
  try {
    const uid = getUserId(req);
    const { watchlist } = req.body;
    
    if (!Array.isArray(watchlist)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'watchlist must be an array'
        }
      });
    }
    
    console.log(`Saving watchlist for user: ${uid}`);
    
    const item = {
      uid,
      watchlist,
      updatedAt: Date.now()
    };
    
    const params = {
      TableName: TABLE_NAME,
      Item: item
    };
    
    await dynamodb.put(params).promise();
    
    res.json(item);
    
  } catch (error) {
    console.error('Error saving watchlist:', error);
    res.status(500).json({
      error: {
        code: 'SAVE_ERROR',
        message: 'Failed to save watchlist'
      }
    });
  }
});

/**
 * DELETE /api/watchlist
 * Delete user's watchlist from DynamoDB
 */
router.delete('/', async (req, res) => {
  try {
    const uid = getUserId(req);
    console.log(`Deleting watchlist for user: ${uid}`);
    
    const params = {
      TableName: TABLE_NAME,
      Key: { uid }
    };
    
    await dynamodb.delete(params).promise();
    
    res.json({ 
      success: true,
      message: 'Watchlist deleted'
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