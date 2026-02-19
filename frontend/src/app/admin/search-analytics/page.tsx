'use client';

import { BarChart3, TrendingUp, Clock, Search, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface SearchStats {
  totalSearches: number;
  zeroResults: number;
  zeroResultsRate: string;
  avgResponseTime: number;
  topQueries: Array<{ query: string; searchCount: number; avgResults: number; avgTimeMs: number }>;
}

export default function SearchAnalyticsPage() {
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashboardRes, topQueriesRes] = await Promise.all([
          adminBackendClient.getSearchDashboard(days),
          adminBackendClient.getTopQueries(days, 20),
        ]);

        const dashboard = dashboardRes as any;
        const topQueries = topQueriesRes as any;

        if (dashboard.success) {
          setStats({
            totalSearches: dashboard.data.metrics.totalSearches,
            zeroResults: dashboard.data.metrics.zeroResults,
            zeroResultsRate: dashboard.data.metrics.zeroResultsRate,
            avgResponseTime: dashboard.data.performance.avgResponseTimeMs,
            topQueries: topQueries.success ? topQueries.data.queries : [],
          });
        } else {
          throw new Error(dashboard.error || 'Failed to fetch analytics data');
        }
      } catch (err: any) {
        console.error('Error fetching stats:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-2" size={32} />
        <h3 className="text-lg font-medium text-red-900">Failed to load analytics</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 size={32} />
              <h1 className="text-3xl font-bold">Search Analytics</h1>
            </div>
            <p className="text-blue-100">
              Monitor search performance and user behavior (Last {days} Days)
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  days === d
                    ? 'bg-white text-blue-700'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Search className="text-blue-600" size={24} />
            <span className="text-sm font-medium text-gray-500">Total Searches</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats?.totalSearches.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500 mt-1">Last {days} days</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Clock className="text-purple-600" size={24} />
            <span className="text-sm font-medium text-gray-500">Avg Response Time</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats?.avgResponseTime ?? 0}ms</div>
          <div className="text-sm text-gray-500 mt-1">Average latency</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="text-green-600" size={24} />
            <span className="text-sm font-medium text-gray-500">Daily Average</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats && days > 0 ? Math.round(stats.totalSearches / days) : 0}
          </div>
          <div className="text-sm text-gray-500 mt-1">Searches per day</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Search className="text-orange-600" size={24} />
            <span className="text-sm font-medium text-gray-500">Zero Results</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats?.zeroResultsRate ?? '0%'}
          </div>
          <div className="text-sm text-red-600 mt-1">
            {stats?.zeroResults ?? 0} failed searches
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Search Queries</h2>
        {!stats?.topQueries?.length ? (
          <div className="text-center py-8 text-gray-500">No search data available yet</div>
        ) : (
          <div className="space-y-3">
            {stats.topQueries.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.query}</div>
                  <div className="text-xs text-gray-500">
                    Avg {item.avgResults} results | {item.avgTimeMs}ms
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{item.searchCount}</div>
                  <div className="text-xs text-gray-500">searches</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
