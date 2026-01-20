import { auth } from './firebase';

const API_BASE = 'https://api-fjyzp7xsqq-uc.a.run.app';

async function authFetch(endpoint, options = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new Error(errorData.error?.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function publicFetch(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  // Profile
  bootstrap: () => authFetch('/bootstrap', { method: 'POST' }),
  getProfile: () => authFetch('/profile'),
  updateProfile: (data) => authFetch('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Image Upload
  initImageUpload: () => authFetch('/profile-image/init', { method: 'POST' }),
  completeImageUpload: (objectKey) => authFetch('/profile-image/complete', {
    method: 'POST',
    body: JSON.stringify({ objectKey }),
  }),
  getImageUrl: () => authFetch('/profile-image/url'),

  // Stocks - now accepts tickers array
  getStocks: (tickers) => {
    if (tickers && tickers.length > 0) {
      const tickersParam = tickers.join(',');
      return publicFetch(`/stocks?tickers=${encodeURIComponent(tickersParam)}`);
    }
    return publicFetch('/stocks');
  },

  getStockSentiment: () => publicFetch('/stocks/sentiment'),

  lookupTicker: (ticker) => publicFetch(`/stocks/lookup/${encodeURIComponent(ticker)}`),

  // Correlations - accepts tickers array
  getCorrelations: (tickers) => {
    if (!tickers || tickers.length < 2) {
      return Promise.resolve({ stocks: [], edges: [], calculatedAt: new Date().toISOString() });
    }
    const tickersParam = tickers.join(',');
    return publicFetch(`/correlations?tickers=${encodeURIComponent(tickersParam)}`);
  },

  refreshCorrelations: (tickers) => {
    return fetch(`${API_BASE}/correlations/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers })
    }).then(r => r.json());
  },

  // Sentiment refresh
  refreshSentiment: () => fetch(`${API_BASE}/stocks/sentiment/refresh`, { method: 'POST' }).then(r => r.json()),

  // Watchlists
  getWatchlists: () => authFetch('/watchlist'),
  saveWatchlists: (watchlists, activeWatchlist) => authFetch('/watchlist', {
    method: 'POST',
    body: JSON.stringify({ watchlists, activeWatchlist }),
  }),
  deleteWatchlist: (name) => authFetch(`/watchlist/${encodeURIComponent(name)}`, { method: 'DELETE' }),
};