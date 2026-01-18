const express = require('express');
const router = express.Router();
const { dynamodb } = require('../config/aws');
const admin = require('firebase-admin'); // ← ADD THIS

const TABLE_NAME = process.env.DDB_TABLE_NAME || 'UserWatchlists';

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
 * GET /api/watchlist
 */
router.get('/', async (req, res) => {
  try {
    const uid = req.uid; // ← CHANGED from getUserId(req)
    console.log(`Fetching watchlist for user: ${uid}`); // ← FIXED template literal
    
    const params = {
      TableName: TABLE_NAME,
      Key: { uid }
    };
    
    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
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
 */
router.post('/', async (req, res) => {
  try {
    const uid = req.uid; // ← CHANGED from getUserId(req)
    const { watchlist } = req.body;
    
    if (!Array.isArray(watchlist)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'watchlist must be an array'
        }
      });
    }
    
    console.log(`Saving watchlist for user: ${uid}`); // ← FIXED template literal
    
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
 */
router.delete('/', async (req, res) => {
  try {
    const uid = req.uid; // ← CHANGED from getUserId(req)
    console.log(`Deleting watchlist for user: ${uid}`); // ← FIXED template literal
    
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