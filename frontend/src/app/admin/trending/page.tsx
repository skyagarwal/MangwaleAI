'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp, Clock, MapPin, RefreshCw, BarChart3, Search, Filter,
  ArrowUp, ArrowDown, Flame, Package, ShoppingCart, Car, Utensils,
  Activity, Target, Calendar, Download, Users, AlertTriangle
} from 'lucide-react';

interface TrendingItem {
  query: string;
  count: number;
  trend: number;
  module: string;
  velocity: 'rising' | 'stable' | 'falling';
}

interface LocationTrend {
  location: string;
  top_queries: string[];
  total_searches: number;
  change: number;
}

interface ProductTrend {
  product_id: string;
  name: string;
  category: string;
  orders: number;
  trend: number;
  revenue: number;
}

export default function TrendingPage() {
  const [activeTab, setActiveTab] = useState<'queries' | 'products' | 'locations' | 'analytics'>('queries');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const [trendingQueries, setTrendingQueries] = useState<TrendingItem[]>([]);
  const [locationTrends, setLocationTrends] = useState<LocationTrend[]>([]);
  const [productTrends, setProductTrends] = useState<ProductTrend[]>([]);
  const [dataSource, setDataSource] = useState<'loading' | 'api' | 'empty'>('loading');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/trending?range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (data.queries) setTrendingQueries(data.queries);
        if (data.locations) setLocationTrends(data.locations);
        if (data.products) setProductTrends(data.products);
        setDataSource('api');
      } else {
        setDataSource('empty');
      }
    } catch (error) {
      console.error('Error loading trending data:', error);
      setDataSource('empty');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const getModuleIcon = (module: string) => {
    switch (module.toLowerCase()) {
      case 'food': return <Utensils className="w-4 h-4 text-orange-400" />;
      case 'ecom': return <ShoppingCart className="w-4 h-4 text-blue-400" />;
      case 'ride': return <Car className="w-4 h-4 text-green-400" />;
      case 'parcel': return <Package className="w-4 h-4 text-purple-400" />;
      default: return <Search className="w-4 h-4 text-gray-400" />;
    }
  };

  const getVelocityIcon = (velocity: string) => {
    switch (velocity) {
      case 'rising': return <ArrowUp className="w-4 h-4 text-green-400" />;
      case 'falling': return <ArrowDown className="w-4 h-4 text-red-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const filteredQueries = trendingQueries.filter(item => {
    const matchesSearch = item.query.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesModule = moduleFilter === 'all' || item.module.toLowerCase() === moduleFilter.toLowerCase();
    return matchesSearch && matchesModule;
  });

  const modules = ['all', ...new Set(trendingQueries.map(q => q.module))];

  const tabs = [
    { id: 'queries', label: 'Search Queries', icon: Search },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-pink-400" />
            Trending Analytics
          </h1>
          <p className="text-gray-400 mt-1">
            Real-time trending searches, products, and insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg transition">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Mock data warning */}
      {dataSource === 'api' && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-300 text-sm">
            Backend trending endpoints currently return sample data. Connect to real search_log analytics for live metrics.
          </p>
        </div>
      )}

      {dataSource === 'empty' && !loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <Search className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-300 font-medium">No trending data available</p>
          <p className="text-gray-500 text-sm mt-1">Trending analytics will appear once search activity is tracked.</p>
        </div>
      )}

      {/* Stats Row */}
      {trendingQueries.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Total Searches</span>
            <Search className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-white">
            {trendingQueries.reduce((acc, q) => acc + q.count, 0).toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Rising Queries</span>
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-orange-400">
            {trendingQueries.filter(q => q.velocity === 'rising').length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Currently trending up</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Active Locations</span>
            <MapPin className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-white">{locationTrends.length}</p>
          <p className="text-xs text-gray-500 mt-1">With active searches</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Query Count</span>
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold mt-2 text-white">{trendingQueries.length}</p>
          <p className="text-xs text-gray-500 mt-1">Tracked queries</p>
        </div>
      </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === tab.id ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Queries Tab */}
      {activeTab === 'queries' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search queries..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            >
              {modules.map((m) => (
                <option key={m} value={m}>{m === 'all' ? 'All Modules' : m}</option>
              ))}
            </select>
          </div>

          {/* Trending List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
              <div className="col-span-1">Rank</div>
              <div className="col-span-4">Query</div>
              <div className="col-span-2">Module</div>
              <div className="col-span-2">Searches</div>
              <div className="col-span-2">Trend</div>
              <div className="col-span-1">Velocity</div>
            </div>
            {filteredQueries.map((item, index) => (
              <div 
                key={index} 
                className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/30 transition"
              >
                <div className="col-span-1">
                  <span className={`text-lg font-bold ${
                    index < 3 ? 'text-yellow-400' : 'text-gray-500'
                  }`}>
                    #{index + 1}
                  </span>
                </div>
                <div className="col-span-4 text-white font-medium">{item.query}</div>
                <div className="col-span-2">
                  <span className="flex items-center gap-2">
                    {getModuleIcon(item.module)}
                    <span className="text-gray-300">{item.module}</span>
                  </span>
                </div>
                <div className="col-span-2 text-gray-300">{item.count.toLocaleString()}</div>
                <div className="col-span-2">
                  <span className={`font-medium ${
                    item.trend > 0 ? 'text-green-400' : item.trend < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {item.trend > 0 ? '+' : ''}{item.trend}%
                  </span>
                </div>
                <div className="col-span-1">{getVelocityIcon(item.velocity)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Trending Products</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Trend</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {productTrends.map((product, index) => (
                  <tr key={product.product_id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <span className={`font-bold ${index < 3 ? 'text-yellow-400' : 'text-gray-500'}`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{product.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{product.orders}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 ${product.trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {product.trend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(product.trend)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      ₹{product.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {locationTrends.map((location, index) => (
            <div key={location.location} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-green-400" />
                  <h3 className="text-white font-semibold">{location.location}</h3>
                </div>
                <span className={`flex items-center gap-1 text-sm ${location.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {location.change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {Math.abs(location.change)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-gray-400">Total Searches</span>
                <span className="text-white font-medium">{location.total_searches.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Top Queries:</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {location.top_queries.map((query) => (
                    <span key={query} className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm">
                      {query}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Search Volume by Module</h3>
            {trendingQueries.length > 0 ? (
              <div className="space-y-4">
                {Object.entries(
                  trendingQueries.reduce((acc, q) => {
                    acc[q.module] = (acc[q.module] || 0) + q.count;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort(([, a], [, b]) => b - a)
                  .map(([module, count]) => {
                    const total = trendingQueries.reduce((s, q) => s + q.count, 0);
                    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={module}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-300">{module}</span>
                          <span className="text-gray-400">{percent}%</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-pink-500" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Peak Hours</h3>
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Peak hours analytics not yet available</p>
              <p className="text-gray-600 text-sm mt-1">
                Requires hourly search volume aggregation from search_logs table.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
