'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp, Clock, MapPin, RefreshCw, BarChart3, Search, Filter,
  ArrowUp, ArrowDown, Flame, Package, ShoppingCart, Car, Utensils,
  Activity, Target, Calendar, Download, Users, AlertTriangle
} from 'lucide-react';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface TrendingItem {
  query: string;
  count: number;
  trend: number;
  module: string;
  velocity: 'rising' | 'stable' | 'falling';
  prevCount?: number;
}

export default function TrendingPage() {
  const [activeTab, setActiveTab] = useState<'queries' | 'analytics'>('queries');
  const [timeRange, setTimeRange] = useState<'1' | '7' | '14' | '30'>('7');
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const [trendingQueries, setTrendingQueries] = useState<TrendingItem[]>([]);
  const [dataSource, setDataSource] = useState<'loading' | 'clickhouse' | 'postgresql' | 'empty'>('loading');
  const [hourlyVolume, setHourlyVolume] = useState<Array<{ period: string; searchCount: number }>>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const daysNum = parseInt(timeRange);

      // Fetch trending from backend (proxies to ClickHouse or falls back to PG)
      const [trendingRes, volumeRes] = await Promise.all([
        adminBackendClient.getSearchTrending(daysNum, moduleFilter !== 'all' ? (moduleFilter === 'food' ? 4 : 5) : undefined),
        adminBackendClient.getSearchVolume(daysNum, 'hour'),
      ]);

      const trending = trendingRes as any;
      const volume = volumeRes as any;

      if (trending.success && trending.data?.queries?.length > 0) {
        setTrendingQueries(trending.data.queries.map((q: any) => ({
          query: q.query,
          count: q.count,
          trend: q.trendPct || q.trend || 0,
          module: q.module || 'food',
          velocity: q.velocity || (q.trendPct > 20 ? 'rising' : q.trendPct < -20 ? 'falling' : 'stable'),
          prevCount: q.prevCount,
        })));
        setDataSource(trending.source === 'clickhouse' ? 'clickhouse' : 'postgresql');
      } else {
        setTrendingQueries([]);
        setDataSource('empty');
      }

      if (volume.success && volume.data?.volume) {
        setHourlyVolume(volume.data.volume);
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
  }, [timeRange, moduleFilter]);

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
    return matchesSearch;
  });

  const tabs = [
    { id: 'queries', label: 'Trending Queries', icon: Search },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  // Compute peak hours from hourly volume
  const peakHours = (() => {
    if (hourlyVolume.length === 0) return [];
    const hourBuckets: Record<number, number> = {};
    for (const v of hourlyVolume) {
      const hour = new Date(v.period).getHours();
      hourBuckets[hour] = (hourBuckets[hour] || 0) + (v as any).searchCount;
    }
    return Object.entries(hourBuckets)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count);
  })();

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
            Real-time trending searches and insights
            {dataSource === 'clickhouse' && (
              <span className="ml-2 px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs">ClickHouse</span>
            )}
            {dataSource === 'postgresql' && (
              <span className="ml-2 px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs">PostgreSQL</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          >
            <option value="all">All Modules</option>
            <option value="food">Food</option>
            <option value="ecom">E-Commerce</option>
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          >
            <option value="1">Last 24 Hours</option>
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {dataSource === 'empty' && !loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <Search className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-300 font-medium">No trending data available</p>
          <p className="text-gray-500 text-sm mt-1">Trending analytics will appear once enough search activity is tracked.</p>
        </div>
      )}

      {/* Stats Row */}
      {trendingQueries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Total Search Volume</span>
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
              <span className="text-gray-400">Unique Queries</span>
              <Target className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">{trendingQueries.length}</p>
            <p className="text-xs text-gray-500 mt-1">With 3+ searches</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Peak Hour</span>
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">
              {peakHours.length > 0 ? `${peakHours[0].hour}:00` : '-'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {peakHours.length > 0 ? `${peakHours[0].count} searches` : 'No data'}
            </p>
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
      {activeTab === 'queries' && trendingQueries.length > 0 && (
        <div className="space-y-4">
          {/* Search filter */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter queries..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>

          {/* Trending List */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
              <div className="col-span-1">Rank</div>
              <div className="col-span-4">Query</div>
              <div className="col-span-2">Module</div>
              <div className="col-span-2">Searches</div>
              <div className="col-span-2">Trend</div>
              <div className="col-span-1">Status</div>
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
            {filteredQueries.length === 0 && (
              <div className="text-center py-6 text-gray-500">No matching queries</div>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Search Volume by velocity */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Query Velocity Distribution</h3>
            {trendingQueries.length > 0 ? (
              <div className="space-y-4">
                {(['rising', 'stable', 'falling'] as const).map(vel => {
                  const count = trendingQueries.filter(q => q.velocity === vel).length;
                  const pct = trendingQueries.length > 0 ? Math.round((count / trendingQueries.length) * 100) : 0;
                  const colorMap = { rising: 'bg-green-500', stable: 'bg-gray-500', falling: 'bg-red-500' };
                  return (
                    <div key={vel}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300 capitalize">{vel}</span>
                        <span className="text-gray-400">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full ${colorMap[vel]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>

          {/* Peak Hours */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Peak Search Hours</h3>
            {peakHours.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  const top = peakHours.slice(0, 8);
                  const maxCount = top[0]?.count || 1;
                  return top.map(({ hour, count }) => (
                    <div key={hour} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-12 text-right">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                      <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500 rounded-full"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-12">{count}</span>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">Peak hours data not available yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
