const express = require('express');
const router = express.Router();
const { dynamodb, s3 } = require('../config/aws');
const admin = require('firebase-admin');

const TABLE_NAME = process.env.DDB_TABLE_NAME || 'Users';
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

const VALID_ROLES = ['Beginner', 'Intermediate', 'Expert'];

/**
 * Middleware to verify Firebase token and extract uid
 * This protects all profile routes - must be logged in
 */
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
    req.email = decodedToken.email;
    next();
    
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
    });
  }
}

// Apply token verification to all routes
router.use(verifyToken);

/**
 * POST /api/bootstrap
 * Called on first login - creates profile if it doesn't exist
 */
router.post('/bootstrap', async (req, res) => {
  try {
    const { uid, email } = req;
    
    // Try to get existing profile
    const getParams = {
      TableName: TABLE_NAME,
      Key: { uid }
    };
    
    const result = await dynamodb.get(getParams).promise();
    
    if (result.Item) {
      // Profile already exists
      console.log(`Profile exists for ${uid}`);
      return res.json(result.Item);
    }
    
    // Create new profile with defaults
    console.log(`Creating new profile for ${uid}`);
    
    const now = new Date().toISOString();
    const profile = {
      uid,
      email,
      displayName: email.split('@')[0], // Use email prefix as default name
      phone: '',
      role: 'Parent', // Default role
      profileImageKey: null,
      watchlist: [], // Your bonus feature
      createdAt: now,
      updatedAt: now
    };
    
    const putParams = {
      TableName: TABLE_NAME,
      Item: profile
    };
    
    await dynamodb.put(putParams).promise();
    
    res.json(profile);
    
  } catch (error) {
    console.error('Bootstrap error:', error);
    res.status(500).json({
      error: { code: 'BOOTSTRAP_ERROR', message: 'Failed to bootstrap profile' }
    });
  }
});

/**
 * GET /api/profile
 * Get current user's profile
 */
router.get('/', async (req, res) => {
  try {
    const { uid } = req;
    
    const params = {
      TableName: TABLE_NAME,
      Key: { uid }
    };
    
    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Profile not found' }
      });
    }
    
    res.json(result.Item);
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch profile' }
    });
  }
});

/**
 * PUT /api/profile
 * Update profile fields (displayName, phone, role)
 */
router.put('/', async (req, res) => {
  try {
    const { uid } = req;
    const { displayName, phone, role } = req.body;
    
    // Validate role if provided
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: { 
          code: 'VALIDATION_ERROR', 
          message: `Role must be one of: ${VALID_ROLES.join(', ')}` 
        }
      });
    }
    
    // Build update expression dynamically
    const updates = [];
    const expressionValues = {};
    const expressionNames = {};
    
    if (displayName !== undefined) {
      updates.push('#displayName = :displayName');
      expressionValues[':displayName'] = displayName;
      expressionNames['#displayName'] = 'displayName';
    }
    
    if (phone !== undefined) {
      updates.push('#phone = :phone');
      expressionValues[':phone'] = phone;
      expressionNames['#phone'] = 'phone';
    }
    
    if (role !== undefined) {
      updates.push('#role = :role');
      expressionValues[':role'] = role;
      expressionNames['#role'] = 'role';
    }
    
    // Always update timestamp
    updates.push('#updatedAt = :updatedAt');
    expressionValues[':updatedAt'] = new Date().toISOString();
    expressionNames['#updatedAt'] = 'updatedAt';
    
    const params = {
      TableName: TABLE_NAME,
      Key: { uid },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.update(params).promise();
    
    res.json(result.Attributes);
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: { code: 'UPDATE_ERROR', message: 'Failed to update profile' }
    });
  }
});

/**
 * POST /init (when mounted at /profile-image)
 * Generate pre-signed URL for uploading profile image to S3
 */
router.post('/init', async (req, res) => {  // ← CHANGED from '/profile-image/init'
  try {
    const { uid } = req;
    
    // Generate unique key for this user's profile image
    const timestamp = Date.now();
    const objectKey = `users/${uid}/profile-${timestamp}.jpg`;
    
    // Generate pre-signed PUT URL (5 minute expiry)
    const uploadUrl = s3.getSignedUrl('putObject', {
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: 'image/jpeg',
      Expires: 300 // 5 minutes
    });
    
    res.json({
      uploadUrl,
      objectKey
    });
    
  } catch (error) {
    console.error('Init profile image error:', error);
    res.status(500).json({
      error: { code: 'INIT_ERROR', message: 'Failed to initialize image upload' }
    });
  }
});

/**
 * POST /complete (when mounted at /profile-image)
 * Save profile image key to DynamoDB after successful S3 upload
 */
router.post('/complete', async (req, res) => {  // ← CHANGED from '/profile-image/complete'
  try {
    const { uid } = req;
    const { objectKey } = req.body;
    
    if (!objectKey) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'objectKey is required' }
      });
    }
    
    // Validate object key belongs to this user
    if (!objectKey.startsWith(`users/${uid}/`)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid object key for user' }
      });
    }
    
    // Update profile with image key
    const params = {
      TableName: TABLE_NAME,
      Key: { uid },
      UpdateExpression: 'SET profileImageKey = :key, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':key': objectKey,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamodb.update(params).promise();
    
    res.json(result.Attributes);
    
  } catch (error) {
    console.error('Complete profile image error:', error);
    res.status(500).json({
      error: { code: 'COMPLETE_ERROR', message: 'Failed to complete image upload' }
    });
  }
});

/**
 * GET /url (when mounted at /profile-image)
 * Get pre-signed URL to view current profile image
 */
router.get('/url', async (req, res) => {  // ← CHANGED from '/profile-image/url'
  try {
    const { uid } = req;
    
    // Get profile to find image key
    const getParams = {
      TableName: TABLE_NAME,
      Key: { uid }
    };
    
    const result = await dynamodb.get(getParams).promise();
    
    if (!result.Item || !result.Item.profileImageKey) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No profile image found' }
      });
    }
    
    // Generate pre-signed GET URL (15 minute expiry)
    const viewUrl = s3.getSignedUrl('getObject', {
      Bucket: BUCKET_NAME,
      Key: result.Item.profileImageKey,
      Expires: 900 // 15 minutes
    });
    
    res.json({
      imageUrl: viewUrl,
      objectKey: result.Item.profileImageKey
    });
    
  } catch (error) {
    console.error('Get profile image URL error:', error);
    res.status(500).json({
      error: { code: 'URL_ERROR', message: 'Failed to get image URL' }
    });
  }
});

