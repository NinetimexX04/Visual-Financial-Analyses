import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { api } from '../api';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

const DEFAULT_WATCHLISTS = {
  'Default': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE', 'NFLX', 'CSCO', 'QCOM', 'IBM', 'AVGO', 'TXN', 'MU', 'UBER']
};

function Dashboard() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [correlations, setCorrelations] = useState(null);
  const [sentiments, setSentiments] = useState({});

  // Watchlist state
  const [watchlists, setWatchlists] = useState(DEFAULT_WATCHLISTS);
  const [activeWatchlist, setActiveWatchlist] = useState('Default');
  const [correlationsStale, setCorrelationsStale] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [error, setError] = useState('');

  // Graph refs
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

  // Derived state
  const currentWatchlist = watchlists[activeWatchlist] || [];

  // Hover highlight state
  const [hoverNode, setHoverNode] = useState(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());

  const [selectedTicker, setSelectedTicker] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Update graph dimensions when container resizes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setGraphDimensions({ width: width, height: 770 });
      }
    };

    setTimeout(updateDimensions, 100);
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [loading]);

  // Initial data load
  useEffect(() => {
    loadData();
  }, []);

  // Configure d3 forces
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force('charge')
        .strength(node => -300 - (node.val * 30))
        .distanceMax(200);

      graphRef.current.d3Force('x', d3.forceX(0).strength(0.15));
      graphRef.current.d3Force('y', d3.forceY(0).strength(0.15));

      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50);
      }, 1000);
    }
  }, [correlations]);

  const centerGraph = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const watchlistsData = await api.getWatchlists().catch(() => ({
        watchlists: DEFAULT_WATCHLISTS,
        activeWatchlist: 'Default'
      }));

      const loadedWatchlists = watchlistsData.watchlists || DEFAULT_WATCHLISTS;
      const loadedActiveWatchlist = watchlistsData.activeWatchlist || 'Default';
      const tickers = loadedWatchlists[loadedActiveWatchlist] || [];

      setWatchlists(loadedWatchlists);
      setActiveWatchlist(loadedActiveWatchlist);

      if (tickers.length > 0) {
        const [stocksData, correlationsData] = await Promise.all([
          api.getStocks(tickers),
          tickers.length >= 2
            ? api.getCorrelations(tickers)
            : Promise.resolve({ stocks: [], edges: [], calculatedAt: new Date().toISOString() })
        ]);

        setStocks(stocksData.stocks);
        setCorrelations(correlationsData);
      } else {
        setStocks([]);
        setCorrelations({ stocks: [], edges: [], calculatedAt: new Date().toISOString() });
      }

      setCorrelationsStale(false);

      // Pass tickers directly!
      loadSentiment(tickers);

    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSentiment = async (tickers) => {
    if (!tickers || tickers.length === 0) {
      setSentiments({});
      return;
    }

    try {
      setSentimentLoading(true);
      const data = await api.getStockSentiment(tickers);

      const sentimentMap = {};
      if (data.sentiments) {
        data.sentiments.forEach(s => {
          sentimentMap[s.ticker] = s;
        });
      }

      setSentiments(sentimentMap);
    } catch (err) {
      console.error('Failed to load sentiment:', err);
    } finally {
      setSentimentLoading(false);
    }
  };

  const loadPriceHistory = async (ticker) => {
    setSelectedTicker(ticker);
    setHistoryLoading(true);
    try {
      const data = await api.getStockHistory(ticker);
      setPriceHistory(data.prices.map((price, i) => ({ day: i, price })));
    } catch (err) {
      console.error('Failed to load history:', err);
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Refresh correlations only (when user clicks "Update Graph")
  const refreshCorrelations = async () => {
    if (currentWatchlist.length < 2) {
      setCorrelations({ stocks: [], edges: [], calculatedAt: new Date().toISOString() });
      setCorrelationsStale(false);
      return;
    }

    setCorrelationsLoading(true);
    try {
      // Fetch both stocks and correlations for current watchlist
      const [stocksData, correlationsData] = await Promise.all([
        api.getStocks(currentWatchlist),
        api.getCorrelations(currentWatchlist)
      ]);

      setStocks(stocksData.stocks);
      setCorrelations(correlationsData);
      setCorrelationsStale(false);
    } catch (err) {
      console.error('Failed to refresh correlations:', err);
      setError(err.message);
    } finally {
      setCorrelationsLoading(false);
    }
  };

  const forceRefreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        api.refreshCorrelations(currentWatchlist),
        api.refreshSentiment(currentWatchlist)
      ]);
      window.location.reload();
    } catch (err) {
      console.error('Refresh failed:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Add ticker to current watchlist
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
      await api.lookupTicker(ticker);

      const updatedList = [...currentWatchlist, ticker];
      const updatedWatchlists = { ...watchlists, [activeWatchlist]: updatedList };
      setWatchlists(updatedWatchlists);
      setTickerInput('');
      setCorrelationsStale(true);

      await api.saveWatchlists(updatedWatchlists, activeWatchlist);
    } catch (err) {
      console.error('Failed to add ticker:', err);
      setTickerError(err.message || `Ticker "${ticker}" not found`);
    } finally {
      setAddingTicker(false);
    }
  };

  // Remove ticker from current watchlist
  const removeFromWatchlist = async (ticker) => {
    const updatedList = currentWatchlist.filter(t => t !== ticker);
    const updatedWatchlists = { ...watchlists, [activeWatchlist]: updatedList };
    setWatchlists(updatedWatchlists);
    setCorrelationsStale(true);

    try {
      await api.saveWatchlists(updatedWatchlists, activeWatchlist);
    } catch (err) {
      console.error('Failed to save watchlist:', err);
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
    setCorrelationsStale(true);

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
      setCorrelationsStale(true);
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
    }
  };

  // Switch active watchlist
  const switchWatchlist = async (name) => {
    setActiveWatchlist(name);
    setCorrelationsStale(true);

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
    setCorrelationsStale(true);

    try {
      await api.saveWatchlists(updatedWatchlists, activeWatchlist);
    } catch (err) {
      console.error('Failed to clear watchlist:', err);
    }
  };

  // Helper functions for graph rendering
  const getNodeColor = (sentiment) => {
    if (!sentiment || sentiment.confidence < 50) {
      return '#64748b';
    }

    const { sentiment: s } = sentiment;
    if (s === 'very_positive' || s === 'positive') return '#10b981';
    if (s === 'very_negative' || s === 'negative') return '#ef4444';

    return '#64748b';
  };

  const shouldGlow = (sentiment) => {
    if (!sentiment) return false;
    return (
      (sentiment.sentiment === 'very_positive' || sentiment.sentiment === 'very_negative') &&
      sentiment.confidence >= 50
    );
  };

  const calculateNodeSizes = (edges, stockList) => {
    const connectionCount = {};

    stockList.forEach(ticker => {
      connectionCount[ticker] = 0;
    });

    edges.forEach(edge => {
      connectionCount[edge.source]++;
      connectionCount[edge.target]++;
    });

    const maxConnections = Math.max(...Object.values(connectionCount), 1);

    const sizes = {};
    stockList.forEach(ticker => {
      const connections = connectionCount[ticker];
      sizes[ticker] = 8 + (connections / maxConnections) * 12;
    });

    return sizes;
  };

  const handleNodeHover = (node) => {
    if (!node) {
      setHoverNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }

    const newHighlightNodes = new Set();
    const newHighlightLinks = new Set();

    // Store node IDs, not objects
    newHighlightNodes.add(node.id);
    node.neighbors?.forEach(neighbor => newHighlightNodes.add(neighbor.id));
    node.links?.forEach(link => newHighlightLinks.add(`${link.source.id || link.source}-${link.target.id || link.target}`));

    setHoverNode(node);
    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
  };

  // Prepare graph data with neighbor references for highlighting
  const graphData = useMemo(() => {
    if (!correlations) return { nodes: [], links: [] };
    
    const nodeSizes = calculateNodeSizes(correlations.edges, correlations.stocks);

    const connectionCounts = {};
    correlations.stocks.forEach(ticker => {
      connectionCounts[ticker] = 0;
    });
    correlations.edges.forEach(edge => {
      connectionCounts[edge.source] = (connectionCounts[edge.source] || 0) + 1;
      connectionCounts[edge.target] = (connectionCounts[edge.target] || 0) + 1;
    });

    const nodes = correlations.stocks.map(ticker => {
      const stock = stocks.find(s => s.ticker === ticker);
      const sentiment = sentiments[ticker];

      return {
        id: ticker,
        name: ticker,
        val: nodeSizes[ticker],
        color: getNodeColor(sentiment),
        sentiment: sentiment,
        stock: stock,
        glow: shouldGlow(sentiment),
        connections: connectionCounts[ticker] || 0,
        neighbors: new Set(),
        links: new Set()
      };
    });

    const links = correlations.edges.map(edge => {
      const sourceSize = nodeSizes[edge.source];
      const targetSize = nodeSizes[edge.target];
      const avgNodeSize = (sourceSize + targetSize) / 2;
      const baseDistance = 200 * (1 - edge.correlation);
      const sizeBuffer = Math.pow(avgNodeSize, 2) * 1.5;

      return {
        source: edge.source,
        target: edge.target,
        value: edge.correlation,
        distance: baseDistance + sizeBuffer,
      };
    });

    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    
    links.forEach(link => {
      const sourceNode = nodeMap.get(link.source);
      const targetNode = nodeMap.get(link.target);
      
      if (sourceNode && targetNode) {
        sourceNode.neighbors.add(targetNode);
        targetNode.neighbors.add(sourceNode);
        sourceNode.links.add(link);
        targetNode.links.add(link);
      }
    });

    return { nodes, links };
  }, [correlations, stocks, sentiments]);

  // Loading screen
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
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-base font-bold text-gray-900">StockViz</span>
            </div>

            <div className="flex items-center gap-2">
              {sentimentLoading && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Analyzing...
                </span>
              )}
              <button
                onClick={forceRefreshAll}
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
          {/* Correlation Graph */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Stock Correlation Network</h2>
                <p className="text-gray-500 text-xs">
                  {correlations?.fromCache ? 'Cached' : 'Fresh'} • Updated {correlations?.calculatedAt ? new Date(correlations.calculatedAt).toLocaleString() : 'N/A'}
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
                  {correlations?.edges?.length || 0} connections
                </span>
              </div>
            </div>

            {/* Stale correlations warning */}
            {correlationsStale && (
              <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                <span className="text-amber-800 text-sm">
                  {currentWatchlist.length < 2 
                    ? `Add ${2 - currentWatchlist.length} more ticker${currentWatchlist.length === 0 ? 's' : ''} to see correlations`
                    : 'Watchlist changed — click to update graph'}
                </span>
                <button
                  onClick={refreshCorrelations}
                  disabled={correlationsLoading || currentWatchlist.length < 2}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {correlationsLoading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Updating...
                    </>
                  ) : (
                    'Update Graph'
                  )}
                </button>
              </div>
            )}

            {/* Not enough tickers warning */}
            {currentWatchlist.length < 2 && !correlationsStale && (
              <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <span className="text-blue-800 text-sm">
                  Add at least 2 tickers to your watchlist to see correlations
                </span>
              </div>
            )}

            {/* Top Correlations */}
            {correlations?.edges?.length > 0 && (
              <div className="mb-3 flex gap-2 flex-wrap items-center">
                <span className="text-gray-500 text-xs">Strongest:</span>
                {[...correlations.edges]
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
            )}

            <div ref={containerRef} className="bg-slate-900 rounded-xl overflow-hidden" style={{ height: '770px' }}>
              {graphData.nodes.length > 0 ? (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  width={graphDimensions.width}
                  height={graphDimensions.height}
                  onNodeHover={handleNodeHover}
                  nodeLabel={node => {
                    const lines = [node.id];
                    if (node.stock) {
                      lines.push(`$${node.stock.price.toFixed(2)}`);
                      lines.push(`${node.stock.change >= 0 ? '+' : ''}${node.stock.changePercent.toFixed(2)}%`);
                    }
                    if (node.sentiment && node.sentiment.confidence >= 50) {
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
                    const fontSize = (node.val * 0.8) / globalScale;
                    
                    // Check by ID instead of object reference
                    const isDimmed = hoverNode && !highlightNodes.has(node.id);
                    const opacity = isDimmed ? 0.2 : 1;

                    if (node.glow && !isDimmed) {
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, node.val + 8, 0, 2 * Math.PI);
                      ctx.fillStyle = node.color + '30';
                      ctx.fill();

                      ctx.beginPath();
                      ctx.arc(node.x, node.y, node.val + 5, 0, 2 * Math.PI);
                      ctx.fillStyle = node.color + '50';
                      ctx.fill();

                      ctx.beginPath();
                      ctx.arc(node.x, node.y, node.val + 2, 0, 2 * Math.PI);
                      ctx.fillStyle = node.color + '70';
                      ctx.fill();
                    }

                    // Draw main node with opacity
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI);
                    ctx.fillStyle = isDimmed 
                      ? `rgba(100, 116, 139, ${opacity})`  // Dimmed gray
                      : node.color;
                    ctx.fill();

                    // Draw label with opacity
                    ctx.font = `bold ${fontSize}px Sans-Serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.fillText(label, node.x, node.y);
                  }}
                  linkWidth={link => {
                    const linkId = `${link.source.id || link.source}-${link.target.id || link.target}`;
                    return highlightLinks.has(linkId) ? 4 : 2;
                  }}
                  linkColor={link => {
                    const linkId = `${link.source.id || link.source}-${link.target.id || link.target}`;
                    if (highlightLinks.has(linkId)) {
                      return 'rgba(255, 255, 255, 0.9)';
                    }
                    if (hoverNode) {
                      return 'rgba(148, 163, 184, 0.1)';
                    }
                    return 'rgba(148, 163, 184, 0.5)';
                  }}
                  linkDistance={link => link.distance}
                  backgroundColor="#0f172a"
                  d3VelocityDecay={0.5}
                  d3AlphaDecay={0.02}
                  d3AlphaMin={0.001}
                  cooldownTicks={500}
                  warmupTicks={100}
                  onNodeClick={(node) => {
                    if (!node.stock) return;

                    let message = `${node.stock.ticker}\nPrice: $${node.stock.price.toFixed(2)}\nChange: ${node.stock.change >= 0 ? '+' : ''}${node.stock.changePercent.toFixed(2)}%\nConnections: ${node.connections}`;

                    if (node.sentiment && node.sentiment.confidence >= 70) {
                      message += `\n\nAI Sentiment: ${node.sentiment.sentiment} (${node.sentiment.confidence}% confident)\n${node.sentiment.summary}`;
                    }

                    alert(message);
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-slate-400">No correlation data to display</p>
                </div>
              )}
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

          {/* Stock List and Watchlist */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Live Prices */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                {selectedTicker ? `${selectedTicker} - 1 Year History` : 'Live Prices'}
              </h2>
              
              {selectedTicker && (
                <div className="mb-4">
                  {historyLoading ? (
                    <div className="h-32 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <Tooltip 
                            formatter={(value) => [`$${value.toFixed(2)}`, 'Price']}
                            labelFormatter={(day) => `Day ${day + 1}`}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="price" 
                            stroke="#2563eb" 
                            strokeWidth={2} 
                            dot={false} 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedTicker(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 mt-2"
                  >
                    ← Back to all prices
                  </button>
                </div>
              )}

              {!selectedTicker && stocks.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {stocks.map(stock => {
                    const sentiment = sentiments[stock.ticker];
                    const showPulse = shouldGlow(sentiment);

                    return (
                      <div
                        key={stock.ticker}
                        onClick={() => loadPriceHistory(stock.ticker)}
                        className={`p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-100 cursor-pointer ${showPulse ? 'animate-pulse' : ''}`}
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
              ) : !selectedTicker && (
                <p className="text-gray-500 text-sm">No stocks in watchlist</p>
              )}
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
                    className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${tickerError ? 'border-red-300' : 'border-gray-200'}`}
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
                        onClick={() => loadPriceHistory(ticker)}
                        className={`p-2 border rounded-lg group cursor-pointer ${selectedTicker === ticker ? 'bg-blue-100 border-blue-300' : 'bg-blue-50 border-blue-100'}`}
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