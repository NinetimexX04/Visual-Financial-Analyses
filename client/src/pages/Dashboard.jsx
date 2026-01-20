import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { api } from '../api';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';

// Default watchlists for new users
const DEFAULT_WATCHLISTS = {
  'Default': ['AAPL', 'NVDA', 'GOOGL', 'XOM', 'JPM', 'JNJ', 'WMT']
};

function Dashboard() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [correlations, setCorrelations] = useState(null);
  const [sentiments, setSentiments] = useState({});

  // Multiple watchlists support
  const [watchlists, setWatchlists] = useState(DEFAULT_WATCHLISTS);
  const [activeWatchlist, setActiveWatchlist] = useState('Default');

  const [loading, setLoading] = useState(true);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [error, setError] = useState('');
  const graphRef = useRef();
  const containerRef = useRef();
  const [graphDimensions, setGraphDimensions] = useState({ width: 1000, height: 770 });

  // Ticker input state
  const [tickerInput, setTickerInput] = useState('');
  const [tickerError, setTickerError] = useState('');
  const [addingTicker, setAddingTicker] = useState(false);

  // New watchlist creation state
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [showCreateWatchlist, setShowCreateWatchlist] = useState(false);

  // Current watchlist (derived from watchlists and activeWatchlist)
  const currentWatchlist = watchlists[activeWatchlist] || [];


  // Update graph dimensions when container resizes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setGraphDimensions({ width: width, height: 770 });
      }
    };

    // Small delay to ensure container is rendered
    setTimeout(updateDimensions, 100);
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [loading]);

  useEffect(() => {
    loadData();
  }, []);

  // Configure d3 forces for better spacing
  useEffect(() => {
    if (graphRef.current) {
      // Charge force - larger nodes repel more strongly
      graphRef.current.d3Force('charge')
        .strength(node => -300 - (node.val * 30)) // Bigger nodes = stronger repulsion
        .distanceMax(200);

      // Add forces that pull ALL nodes toward center (keeps clusters together)
      graphRef.current.d3Force('x', d3.forceX(0).strength(0.15));
      graphRef.current.d3Force('y', d3.forceY(0).strength(0.15));

      // Center view after simulation settles
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50);
      }, 1000);
    }
  }, [correlations]);


  const centerGraph = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50); // 400ms animation, 50px padding
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [stocksData, correlationsData, watchlistsData] = await Promise.all([
        api.getStocks(),
        api.getCorrelations(),
        api.getWatchlists().catch(() => ({ watchlists: DEFAULT_WATCHLISTS, activeWatchlist: 'Default' }))
      ]);

      setStocks(stocksData.stocks);
      setCorrelations(correlationsData);
      setWatchlists(watchlistsData.watchlists || DEFAULT_WATCHLISTS);
      setActiveWatchlist(watchlistsData.activeWatchlist || 'Default');

      loadSentiment();

    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSentiment = async () => {
    try {
      setSentimentLoading(true);
      console.log('Loading AI sentiment analysis...');
      
      const data = await api.getStockSentiment();
      
      const sentimentMap = {};
      data.sentiments.forEach(s => {
        sentimentMap[s.ticker] = s;
      });
      
      setSentiments(sentimentMap);
      console.log('Sentiment analysis loaded:', sentimentMap);
      
    } catch (err) {
      console.error('Failed to load sentiment:', err);
    } finally {
      setSentimentLoading(false);
    }
  };

  // Remove ticker from current watchlist
  const removeFromWatchlist = async (ticker) => {
    const updatedList = currentWatchlist.filter(t => t !== ticker);
    const updatedWatchlists = { ...watchlists, [activeWatchlist]: updatedList };
    setWatchlists(updatedWatchlists);

    try {
      await api.saveWatchlists(updatedWatchlists, activeWatchlist);
    } catch (err) {
      console.error('Failed to save watchlist:', err);
    }
  };

  // Add ticker to current watchlist (with validation)
  const addTickerToWatchlist = async (e) => {
    e.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();

    if (!ticker) {
      setTickerError('Please enter a ticker symbol');
      return;
    }

    if (currentWatchlist.includes(ticker)) {
      setTickerError(`${ticker} is already in this watchlist`);
      return;
    }

    setAddingTicker(true);
    setTickerError('');

    try {
      // Validate ticker against Yahoo Finance
      await api.lookupTicker(ticker);

      // Valid ticker - add to current watchlist
      const updatedList = [...currentWatchlist, ticker];
      const updatedWatchlists = { ...watchlists, [activeWatchlist]: updatedList };
      setWatchlists(updatedWatchlists);
      setTickerInput('');

      await api.saveWatchlists(updatedWatchlists, activeWatchlist);
    } catch (err) {
      console.error('Failed to add ticker:', err);
      setTickerError(err.message || `Ticker "${ticker}" not found`);
    } finally {
      setAddingTicker(false);
    }
  };

  // Create a new watchlist
  const createWatchlist = async (e) => {
    e.preventDefault();
    const name = newWatchlistName.trim();

    if (!name) return;

    if (watchlists[name]) {
      setTickerError(`Watchlist "${name}" already exists`);
      return;
    }

    const updatedWatchlists = { ...watchlists, [name]: [] };
    setWatchlists(updatedWatchlists);
    setActiveWatchlist(name);
    setNewWatchlistName('');
    setShowCreateWatchlist(false);

    try {
      await api.saveWatchlists(updatedWatchlists, name);
    } catch (err) {
      console.error('Failed to create watchlist:', err);
    }
  };

  // Delete a watchlist
  const deleteCurrentWatchlist = async () => {
    if (Object.keys(watchlists).length <= 1) {
      setTickerError('Cannot delete the last watchlist');
      return;
    }

    try {
      const result = await api.deleteWatchlist(activeWatchlist);
      setWatchlists(result.watchlists);
      setActiveWatchlist(result.activeWatchlist);
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
    }
  };

  // Switch active watchlist
  const switchWatchlist = async (name) => {
    setActiveWatchlist(name);
    try {
      await api.saveWatchlists(watchlists, name);
    } catch (err) {
      console.error('Failed to switch watchlist:', err);
    }
  };

  // Clear current watchlist
  const clearCurrentWatchlist = async () => {
    const updatedWatchlists = { ...watchlists, [activeWatchlist]: [] };
    setWatchlists(updatedWatchlists);

    try {
      await api.saveWatchlists(updatedWatchlists, activeWatchlist);
    } catch (err) {
      console.error('Failed to clear watchlist:', err);
    }
  };

  const refreshData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (forceRefresh) {
        // Force refresh correlations and sentiment (bypasses cache)
        console.log('Force refreshing all data...');
        await Promise.all([
          api.refreshCorrelations(),
          api.refreshSentiment()
        ]);

        // Reload the page to get fresh data and reset graph state
        window.location.reload();
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('Refresh failed:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const getNodeColor = (sentiment) => {
    if (!sentiment || sentiment.confidence < 50) {
      return '#64748b';
    }

    const { sentiment: s } = sentiment;

    // Use solid dark colors for all positive/negative (glow indicates very_positive/very_negative)
    if (s === 'very_positive' || s === 'positive') return '#10b981'; // Dark green
    if (s === 'very_negative' || s === 'negative') return '#ef4444'; // Dark red

    return '#64748b';
  };

  const shouldBlink = (sentiment) => {
    if (!sentiment) return false;

    return (
      (sentiment.sentiment === 'very_positive' || sentiment.sentiment === 'very_negative') &&
      sentiment.confidence >= 50
    );
  };

  // Calculate node size based on number of connections (degree centrality)
  const calculateNodeSizes = (edges, stocks) => {
    const connectionCount = {};
    
    // Count connections for each stock
    stocks.forEach(ticker => {
      connectionCount[ticker] = 0;
    });
    
    edges.forEach(edge => {
      connectionCount[edge.source]++;
      connectionCount[edge.target]++;
    });
    
    // Find max connections
    const maxConnections = Math.max(...Object.values(connectionCount));
    
    // Map to sizes: 8 (min) to 20 (max)
    const sizes = {};
    stocks.forEach(ticker => {
      const connections = connectionCount[ticker];
      sizes[ticker] = 8 + (connections / maxConnections) * 12; // 8-20 range
    });
    
    return sizes;
  };

  // Prepare graph data with hub-based sizing
  const graphData = correlations ? (() => {
    const nodeSizes = calculateNodeSizes(correlations.edges, correlations.stocks);

    // Count actual connections per stock
    const connectionCounts = {};
    correlations.stocks.forEach(ticker => {
      connectionCounts[ticker] = 0;
    });
    correlations.edges.forEach(edge => {
      connectionCounts[edge.source] = (connectionCounts[edge.source] || 0) + 1;
      connectionCounts[edge.target] = (connectionCounts[edge.target] || 0) + 1;
    });

    return {
      nodes: correlations.stocks.map(ticker => {
        const stock = stocks.find(s => s.ticker === ticker);
        const sentiment = sentiments[ticker];

        return {
          id: ticker,
          name: ticker,
          val: nodeSizes[ticker], // SIZE BASED ON CONNECTIONS!
          color: getNodeColor(sentiment),
          sentiment: sentiment,
          stock: stock,
          blink: shouldBlink(sentiment),
          connections: connectionCounts[ticker] || 0 // Actual connection count
        };
      }),
      links: correlations.edges.map(edge => {
        // Get node sizes for this edge
        const sourceSize = nodeSizes[edge.source];
        const targetSize = nodeSizes[edge.target];
        const avgNodeSize = (sourceSize + targetSize) / 2;
        
        // Base distance from correlation
        const baseDistance = 200 * (1 - edge.correlation);

        // Add node size buffer - larger nodes need MUCH more distance
        // avgNodeSize ranges from 8-20, so this creates significant spacing for big nodes
        const sizeBuffer = Math.pow(avgNodeSize, 2) * 1.5;
        
        return {
          source: edge.source,
          target: edge.target,
          value: edge.correlation,
          // Final distance = base + buffer for node sizes
          distance: baseDistance + sizeBuffer,
        };
      })
    };
  })() : { nodes: [], links: [] };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg">Loading market data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12">
            {/* Logo / Brand */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-base font-bold text-gray-900">StockViz</span>
            </div>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#" className="text-blue-600 font-medium text-sm">Dashboard</a>
              <a href="#" className="text-gray-500 hover:text-gray-900 transition-colors text-sm">Markets</a>
              <a href="#" className="text-gray-500 hover:text-gray-900 transition-colors text-sm">Analysis</a>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {sentimentLoading && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Analyzing...
                </span>
              )}
              <button
                onClick={() => refreshData(true)}
                className="px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Refresh All
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
              >
                Profile
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Correlation Graph - Main Feature */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Stock Correlation Network</h2>
                <p className="text-gray-500 text-xs">
                  {correlations?.fromCache ? 'Cached' : 'Fresh'} • Updated {new Date(correlations?.calculatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={centerGraph}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors text-xs font-medium"
                >
                  Center View
                </button>
                <span className="text-gray-500 text-xs">
                  {correlations?.edges.length} connections
                </span>
              </div>
            </div>

            {/* Top Correlations */}
            <div className="mb-3 flex gap-2 flex-wrap items-center">
              <span className="text-gray-500 text-xs">Strongest:</span>
              {correlations?.edges
                .sort((a, b) => b.correlation - a.correlation)
                .slice(0, 3)
                .map(edge => (
                  <span
                    key={`${edge.source}-${edge.target}`}
                    className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                  >
                    {edge.source}-{edge.target} ({(edge.correlation * 100).toFixed(0)}%)
                  </span>
                ))
              }
            </div>

            <div ref={containerRef} className="bg-slate-900 rounded-xl overflow-hidden" style={{ height: '770px' }}>
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                width={graphDimensions.width}
                height={graphDimensions.height}
                nodeLabel={node => {
                  const lines = [node.id];
                  if (node.stock) {
                    lines.push(`$${node.stock.price.toFixed(2)}`);
                    lines.push(`${node.stock.change >= 0 ? '+' : ''}${node.stock.changePercent.toFixed(2)}%`);
                  }
                  if (node.sentiment && node.sentiment.confidence >= 70) {
                    lines.push('');
                    lines.push(node.sentiment.summary);
                  }
                  lines.push('');
                  lines.push(`Connections: ${node.connections}`);
                  return lines.join('\n');
                }}
                linkLabel={link => `Correlation: ${(link.value * 100).toFixed(0)}%`}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const label = node.id;
                  // Scale font size with node size (node.val ranges from 8-20)
                  const fontSize = (node.val * 0.8) / globalScale;

                  // Draw static glow for major news (very_positive/very_negative)
                  if (node.blink) {
                    // Outer glow ring
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val + 8, 0, 2 * Math.PI);
                    ctx.fillStyle = node.color + '30';
                    ctx.fill();

                    // Middle glow ring
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val + 5, 0, 2 * Math.PI);
                    ctx.fillStyle = node.color + '50';
                    ctx.fill();

                    // Inner glow ring
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val + 2, 0, 2 * Math.PI);
                    ctx.fillStyle = node.color + '70';
                    ctx.fill();
                  }

                  // Draw main node
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI);
                  ctx.fillStyle = node.color;
                  ctx.fill();

                  // Draw label
                  ctx.font = `bold ${fontSize}px Sans-Serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = 'white';
                  ctx.fillText(label, node.x, node.y);
                }}
                linkWidth={3}
                linkDistance={link => link.distance}
                linkColor={() => 'rgba(148, 163, 184, 0.5)'}
                backgroundColor="#0f172a"
                d3VelocityDecay={0.5}
                d3AlphaDecay={0.02}
                d3AlphaMin={0.001}
                cooldownTicks={500}
                warmupTicks={100}
                onNodeClick={(node) => {
                  const stock = node.stock;
                  const sentiment = node.sentiment;

                  let message = `${stock.ticker}\nPrice: $${stock.price.toFixed(2)}\nChange: ${stock.change >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%\nConnections: ${node.connections}`;

                  if (sentiment && sentiment.confidence >= 70) {
                    message += `\n\nAI Sentiment: ${sentiment.sentiment} (${sentiment.confidence}% confident)\n${sentiment.summary}`;
                  }

                  alert(message);
                }}
              />
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-6 text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-700">Node Size:</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Small = isolated</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span> Large = hub</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-700">Distance:</span>
                <span>Close = high correlation</span>
                <span>Far = low correlation</span>
              </div>
            </div>
          </div>

          {/* Stock List and Watchlist - Bottom Section */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Live Prices */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Live Prices</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {stocks.map(stock => {
                  const sentiment = sentiments[stock.ticker];
                  const showPulse = shouldBlink(sentiment);

                  return (
                    <div
                      key={stock.ticker}
                      className={`p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-100 ${
                        showPulse ? 'animate-pulse' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-900 font-medium text-xs">{stock.ticker}</span>
                          {sentiment && (
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: getNodeColor(sentiment) }}
                              title={sentiment.summary}
                            />
                          )}
                        </div>
                        <div className={`text-xs font-medium ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">${stock.price.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Watchlists */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              {/* Watchlist Selector */}
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={activeWatchlist}
                  onChange={(e) => switchWatchlist(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {Object.keys(watchlists).map(name => (
                    <option key={name} value={name}>
                      {name} ({watchlists[name].length})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowCreateWatchlist(!showCreateWatchlist)}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  title="Create new watchlist"
                >
                  + New
                </button>
              </div>

              {/* Create New Watchlist Form */}
              {showCreateWatchlist && (
                <form onSubmit={createWatchlist} className="mb-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newWatchlistName}
                      onChange={(e) => setNewWatchlistName(e.target.value)}
                      placeholder="Watchlist name..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!newWatchlistName.trim()}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateWatchlist(false);
                        setNewWatchlistName('');
                      }}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Watchlist Actions */}
              <div className="flex gap-2 mb-3">
                {currentWatchlist.length > 0 && (
                  <button
                    onClick={clearCurrentWatchlist}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                  >
                    Clear List
                  </button>
                )}
                {Object.keys(watchlists).length > 1 && (
                  <button
                    onClick={deleteCurrentWatchlist}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    Delete Watchlist
                  </button>
                )}
              </div>

              {/* Add Ticker Form */}
              <form onSubmit={addTickerToWatchlist} className="mb-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => {
                      setTickerInput(e.target.value.toUpperCase());
                      setTickerError('');
                    }}
                    placeholder="Enter ticker (e.g., AAPL)"
                    className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      tickerError ? 'border-red-300' : 'border-gray-200'
                    }`}
                    disabled={addingTicker}
                  />
                  <button
                    type="submit"
                    disabled={addingTicker || !tickerInput.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {addingTicker ? 'Adding...' : 'Add'}
                  </button>
                </div>
                {tickerError && (
                  <p className="mt-1 text-xs text-red-600">{tickerError}</p>
                )}
              </form>

              {/* Watchlist Items */}
              {currentWatchlist.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {currentWatchlist.map(ticker => {
                    const stock = stocks.find(s => s.ticker === ticker);
                    const sentiment = sentiments[ticker];

                    return (
                      <div
                        key={ticker}
                        className="p-2 bg-blue-50 border border-blue-100 rounded-lg group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-900 font-medium text-xs">{ticker}</span>
                            {sentiment && (
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: getNodeColor(sentiment) }}
                              />
                            )}
                          </div>
                          <button
                            onClick={() => removeFromWatchlist(ticker)}
                            className="text-xs text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          {stock ? (
                            <>
                              <span className="text-gray-500 text-xs">${stock.price.toFixed(2)}</span>
                              <span className={`text-xs font-medium ${stock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-400 text-xs">Loading...</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-xs">
                    Enter a ticker above to add it to this watchlist
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;