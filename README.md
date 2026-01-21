# Visual Finance Analyzer

A stock correlation visualization app with AI-powered sentiment analysis.

**Live Demo:** https://visual-finance-analyzer.web.app

**Demo Video:** [[Link to Loom/video]](https://youtu.be/DnSyKF6bjn4)

## Features

- Firebase Authentication (email/password)
- User profiles with image upload (AWS S3 pre-signed URLs)
- Multiple watchlists stored in DynamoDB
- Real-time stock prices via Yahoo Finance
- Stock correlation network graph (force-directed visualization)
- AI sentiment analysis using Claude API + NewsAPI

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Firebase Cloud Functions (Node.js/Express) |
| Auth | Firebase Authentication |
| Database | AWS DynamoDB |
| Storage | AWS S3 (private bucket + pre-signed URLs) |
| Secrets | Firebase Functions Secrets (Google Secret Manager) |

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Login, Profile, Dashboard
│   │   ├── api.js         # API client
│   │   └── firebase.js    # Firebase config
│   └── package.json
├── functions/              # Firebase Cloud Functions
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Business logic
│   │   └── config/        # AWS config
│   └── package.json
└── firebase.json           # Firebase hosting/functions config
```

## API Endpoints

### Auth Required (Bearer token)
- `POST /api/bootstrap` - Create profile on first login
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile fields
- `POST /api/profile-image/init` - Get S3 upload URL
- `POST /api/profile-image/complete` - Save image key to DB
- `GET /api/profile-image/url` - Get S3 download URL
- `GET /api/watchlist` - Get user's watchlists
- `POST /api/watchlist` - Save watchlists
- `DELETE /api/watchlist/:name` - Delete a watchlist

### Public
- `GET /api/stocks?tickers=AAPL,TSLA` - Get current prices
- `GET /api/stocks/sentiment?tickers=AAPL,TSLA` - Get AI sentiment
- `GET /api/correlations?tickers=AAPL,TSLA,NVDA` - Get correlation data
- `GET /api/stocks/history/:ticker` - Get 1-year price history

## Local Development

```bash
# Frontend
cd client
npm install
npm run dev
# Runs on http://localhost:5173

# Backend requires Firebase emulator + secrets configured
# Recommended: Use deployed version for testing
```

## Deployment

```bash
# Build frontend
cd client
npm run build

# Deploy everything
firebase deploy

# Deploy functions only
firebase deploy --only functions

# Deploy hosting only
firebase deploy --only hosting
```

## AWS Setup (Performed in Developer Account)

### DynamoDB
- Table name: `Users`
- Partition key: `uid` (String)
- Capacity: On-demand

### S3
- Private bucket with Block Public Access enabled
- Objects stored as: `users/{uid}/profile-{timestamp}.jpg`
- CORS configured for Firebase hosting domain

### IAM
- Created IAM user with programmatic access
- Minimal permissions for DynamoDB and S3 only:
  - `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` on Users table
  - `s3:GetObject`, `PutObject`, `DeleteObject` on profile bucket

### Secrets (Firebase)
```bash
firebase functions:secrets:set AWS_ACCESS_KEY_ID
firebase functions:secrets:set AWS_SECRET_ACCESS_KEY
firebase functions:secrets:set AWS_REGION
firebase functions:secrets:set DDB_TABLE_NAME
firebase functions:secrets:set S3_BUCKET_NAME
firebase functions:secrets:set NEWS_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
```

## Security

- No AWS credentials in frontend code
- All AWS calls happen server-side in Cloud Functions
- Firebase ID tokens verified on every backend request
- S3 bucket is private; images accessed via short-lived pre-signed URLs
- Secrets managed via Firebase Functions Secrets (Google Secret Manager)

## Author

Alex - UCCS '26
