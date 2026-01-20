const { defineSecret } = require('firebase-functions/params');

// Define secrets
const awsAccessKeyId = defineSecret('AWS_ACCESS_KEY_ID');
const awsSecretAccessKey = defineSecret('AWS_SECRET_ACCESS_KEY');
const awsRegion = defineSecret('AWS_REGION');
const ddbTableName = defineSecret('DDB_TABLE_NAME');
const s3BucketName = defineSecret('S3_BUCKET_NAME');
const newsApiKey = defineSecret('NEWS_API_KEY');
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin'); 

// Initialize Firebase Admin (needed for token verification)
admin.initializeApp(); 

// Create Express app
const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Import route handlers
const stocksRouter = require('./src/routes/stocks');
const correlationsRouter = require('./src/routes/correlations');
const watchlistRouter = require('./src/routes/watchlist');
const profileRouter = require('./src/routes/profile'); 

// Mount routes
app.use('/stocks', stocksRouter);
app.use('/correlations', correlationsRouter);
app.use('/watchlist', watchlistRouter);
app.use('/profile', profileRouter);
app.use('/profile-image', profileRouter);

// Bootstrap endpoint (special case - needs to be at root level)
app.post('/bootstrap', async (req, res, next) => {
  // Forward to profile router
  req.url = '/bootstrap';
  profileRouter(req, res, next);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0' // Multiple watchlists support
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Market Correlation API with AI Sentiment Analysis',
    endpoints: {
      health: '/api/health',
      stocks: '/api/stocks',
      sentiment: '/api/stocks/sentiment',
      correlations: '/api/correlations',
      watchlist: {
        get: 'GET /api/watchlist',
        save: 'POST /api/watchlist',
        delete: 'DELETE /api/watchlist'
      },
      profile: { 
        bootstrap: 'POST /api/bootstrap',
        get: 'GET /api/profile',
        update: 'PUT /api/profile',
        imageInit: 'POST /api/profile-image/init',
        imageComplete: 'POST /api/profile-image/complete',
        imageUrl: 'GET /api/profile-image/url'
      }
    }
  });
});

// Export with secrets (v2 syntax)
exports.api = functions.https.onRequest(
  {
    secrets: [
      awsAccessKeyId,
      awsSecretAccessKey,
      awsRegion,
      ddbTableName,
      s3BucketName,
      newsApiKey,
      anthropicApiKey
    ]
  },
  app
);