import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { api } from '../api';
import ForceGraph2D from 'react-force-graph-2d';

function Dashboard() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [correlations, setCorrelations] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const graphRef = useRef();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load stocks and correlations in parallel
      const [stocksData, correlationsData, watchlistData] = await Promise.all([
        api.getStocks(),
        api.getCorrelations(),
        api.getWatchlist().catch(() => ({ watchlist: [] })) // Watchlist might not exist
      ]);
      
      setStocks(stocksData.stocks);
      setCorrelations(correlationsData);
      setWatchlist(watchlistData.watchlist || []);
      
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleWatchlist = async (ticker) => {
    const newWatchlist = watchlist.includes(ticker)
      ? watchlist.filter(t => t !== ticker)
      : [...watchlist, ticker];
    
    setWatchlist(newWatchlist);
    
    try {
      await api.saveWatchlist(newWatchlist);
    } catch (err) {
      console.error('Failed to save watchlist:', err);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    await loadData();
  };

  // Prepare graph data
  const graphData = correlations ? {
    nodes: correlations.stocks.map(ticker => {
      const stock = stocks.find(s => s.ticker === ticker);
      return {
        id: ticker,
        name: ticker,
        val: Math.abs(stock?.changePercent || 1) * 10, // Node size based on change
        color: stock?.change >= 0 ? '#10b981' : '#ef4444' // Green/Red
      };
    }),
    links: correlations.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      value: edge.correlation,
      color: `rgba(100, 116, 139, ${edge.correlation})` // Transparency based on correlation
    }))
  } : { nodes: [], links: [] };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading market data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Market Correlations</h1>
            <p className="text-gray-400 mt-1">Tech Stock Network Analysis</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              Refresh Data
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Profile
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Stock List */}
          <div className="bg-gray-800 rounded-lg shadow-2xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Live Prices</h2>
            <div className="space-y-3">
              {stocks.map(stock => (
                <div
                  key={stock.ticker}
                  className="flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleWatchlist(stock.ticker)}
                      className={`text-2xl ${
                        watchlist.includes(stock.ticker)
                          ? 'text-yellow-400'
                          : 'text-gray-500 hover:text-yellow-400'
                      }`}
                    >
                      ★
                    </button>
                    <div>
                      <div className="text-white font-semibold">{stock.ticker}</div>
                      <div className="text-gray-400 text-sm">${stock.price.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className={`text-right ${stock.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <div className="font-semibold">
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                    </div>
                    <div className="text-sm">
                      {stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Watchlist Summary */}
            {watchlist.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">
                  My Watchlist ({watchlist.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {watchlist.map(ticker => (
                    <span
                      key={ticker}
                      className="px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-sm"
                    >
                      {ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Correlation Graph */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Correlation Network</h2>
                <p className="text-gray-400 text-sm">
                  {correlations?.fromCache ? '(Cached)' : '(Fresh)'} • 
                  Updated: {new Date(correlations?.calculatedAt).toLocaleString()}
                </p>
              </div>
              <div className="text-gray-400 text-sm">
                {correlations?.edges.length} connections
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg" style={{ height: '600px' }}>
              <ForceGraph2D
                ref={graphRef}
                graphData={graphData}
                nodeLabel="id"
                nodeAutoColorBy="color"
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const label = node.id;
                  const fontSize = 12/globalScale;
                  ctx.font = `${fontSize}px Sans-Serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = node.color;
                  
                  // Draw circle
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI);
                  ctx.fill();
                  
                  // Draw label
                  ctx.fillStyle = 'white';
                  ctx.fillText(label, node.x, node.y);
                }}
                linkWidth={link => link.value * 2}
                linkColor={() => 'rgba(100, 116, 139, 0.4)'}
                backgroundColor="#111827"
                onNodeClick={(node) => {
                  const stock = stocks.find(s => s.ticker === node.id);
                  if (stock) {
                    alert(`${stock.ticker}\nPrice: $${stock.price.toFixed(2)}\nChange: ${stock.change >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`);
                  }
                }}
              />
            </div>

            <div className="mt-4 text-gray-400 text-sm">
              <p>• <strong>Node size:</strong> Daily price change magnitude</p>
              <p>• <strong>Node color:</strong> Green = Up, Red = Down</p>
              <p>• <strong>Connections:</strong> Stocks with correlation &gt; 0.5</p>
              <p>• <strong>Click nodes</strong> for details • <strong>Drag</strong> to rearrange</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
