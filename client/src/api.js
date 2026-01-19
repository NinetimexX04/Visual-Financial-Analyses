import { auth } from './firebase';

// Use direct Cloud Function URL
const API_BASE = 'https://api-fjyzp7xsqq-uc.a.run.app';

/**
 * Make authenticated API request
 */
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

/**
 * Make unauthenticated API request (for public endpoints)
 */
async function publicFetch(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  
  return response.json();
}

// Profile API
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
  
  // Stocks (public - no auth required)
  getStocks: () => publicFetch('/stocks'),
  
  // Correlations (public - no auth required)
  getCorrelations: () => publicFetch('/correlations'),
  refreshCorrelations: () => publicFetch('/correlations/refresh'),
  
  // Watchlist (requires auth)
  getWatchlist: () => authFetch('/watchlist'),
  saveWatchlist: (watchlist) => authFetch('/watchlist', {
    method: 'POST',
    body: JSON.stringify({ watchlist }),
  }),
  deleteWatchlist: () => authFetch('/watchlist', { method: 'DELETE' }),
};
