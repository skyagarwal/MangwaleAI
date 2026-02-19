'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, Clock, MapPin, RefreshCw, BarChart3, Search, Filter,
  ArrowUp, ArrowDown, Flame, Package, ShoppingCart, Car, Utensils,
  Activity, Target, Calendar, Download, Users, Map, Layers
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import('./MapComponent'), {
  loading: () => <div className="h-96 bg-gray-200 rounded-lg flex items-center justify-center">Loading map...</div>,
  ssr: false
});

interface TrendingItem {
  query: string;
  count: number;
  trend: number;
  module: string;
  velocity: 'rising' | 'stable' | 'falling';
}

interface Zone {
  id: number;
  name: string;
  coordinates: any;
  total_searches: number;
  status: 'active' | 'inactive';
}

interface ProductTrend {
  product_id: string;
  name: string;
  category: string;
  orders: number;
  trend: number;
  revenue: number;
}

export default function EnhancedTrendingPage() {
  const [activeTab, setActiveTab] = useState<'map' | 'queries' | 'products' | 'analytics'>('map');
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const [zones, setZones] = useState<Zone[]>([
    { id: 4, name: 'Nashik New', coordinates: null, total_searches: 5670, status: 'active' },
    { id: 7, name: 'Nashik - Road Jailroad', coordinates: null, total_searches: 2340, status: 'inactive' },
    { id: 8, name: 'Nashik - College Road', coordinates: null, total_searches: 1890, status: 'inactive' },
  ]);

  const [trendingQueries, setTrendingQueries] = useState<TrendingItem[]>([
    { query: 'pizza delivery', count: 2450, trend: 245, module: 'Food', velocity: 'rising' },
    { query: 'grocery home delivery', count: 1890, trend: 189, module: 'Ecom', velocity: 'rising' },
    { query: 'urgent parcel', count: 1560, trend: 156, module: 'Parcel', velocity: 'rising' },
    { query: 'airport taxi', count: 1340, trend: 134, module: 'Ride', velocity: 'stable' },
    { query: 'biryani near me', count: 876, trend: 87, module: 'Food', velocity: 'rising' },
  ]);

  const [productTrends, setProductTrends] = useState<ProductTrend[]>([
    { product_id: '1', name: 'Margherita Pizza', category: 'Food', orders: 345, trend: 156, revenue: 69000 },
    { product_id: '2', name: 'Chicken Biryani', category: 'Food', orders: 298, trend: 89, revenue: 59600 },
    { product_id: '3', name: 'Onions (1kg)', category: 'Grocery', orders: 567, trend: 45, revenue: 17010 },
  ]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load zones from API
      const response = await fetch('/api/search-admin/zones');
      if (response.ok) {
        const data = await response.json();
        setZones(data.zones || zones);
      }
    } catch (error) {
      console.error('Error loading data:', error);
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

  const getVelocityColor = (velocity: string) => {
    switch (velocity) {
      case 'rising': return 'text-green-600 bg-green-50';
      case 'stable': return 'text-gray-600 bg-gray-50';
      case 'falling': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp size={32} />
              <h1 className="text-3xl font-bold">Trending Analysis</h1>
            </div>
            <p className="text-emerald-100">
              Real-time trending data with zone mapping and analytics
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('map')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'map'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Map size={18} />
            Zone Map
          </div>
        </button>
        <button
          onClick={() => setActiveTab('queries')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'queries'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Search size={18} />
            Top Queries
          </div>
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'products'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package size={18} />
            Hot Products
          </div>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'analytics'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={18} />
            Analytics
          </div>
        </button>
      </div>

      {/* TAB: Map View */}
      {activeTab === 'map' && (
        <div className="space-y-6">
          <MapComponent zones={zones} />
          
          {/* Zone Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {zones.map((zone) => (
              <div key={zone.id} className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{zone.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">Zone ID: {zone.id}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    zone.status === 'active' 
                      ? 'bg-green-50 text-green-700' 
                      : 'bg-gray-50 text-gray-700'
                  }`}>
                    {zone.status}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Searches:</span>
                    <span className="font-semibold">{zone.total_searches.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-600"
                      style={{ width: `${(zone.total_searches / 6000) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Trending Queries */}
      {activeTab === 'queries' && (
        <div className="space-y-4">
          {trendingQueries.map((item, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 shadow-md border border-gray-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getModuleIcon(item.module)}
                    <h4 className="font-semibold text-gray-900">"{item.query}"</h4>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Search size={14} /> {item.count.toLocaleString()} searches
                    </span>
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                      {item.module}
                    </span>
                  </div>
                </div>
                <div className={`text-right ${getVelocityColor(item.velocity)}`}>
                  <div className="text-xl font-bold">+{item.trend}</div>
                  <div className="text-xs capitalize">{item.velocity}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Hot Products */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {productTrends.map((product) => (
            <div key={product.product_id} className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-gray-900">{product.name}</h4>
                  <p className="text-sm text-gray-500">{product.category}</p>
                </div>
                <Flame className="text-orange-500" size={20} />
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Orders:</span>
                  <span className="font-semibold">{product.orders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Revenue:</span>
                  <span className="font-semibold">₹{(product.revenue / 1000).toFixed(1)}K</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Trend:</span>
                  <span className="font-semibold">+{product.trend}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Search Distribution</h3>
            <div className="space-y-3">
              {trendingQueries.slice(0, 5).map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.module}</span>
                    <span className="font-semibold">{((item.count / 8116) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-600"
                      style={{ width: `${(item.count / 2450) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Zone Performance</h3>
            <div className="space-y-3">
              {zones.map((zone) => (
                <div key={zone.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{zone.name}</span>
                    <span className="font-semibold">{((zone.total_searches / 9900) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600"
                      style={{ width: `${(zone.total_searches / 5670) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
