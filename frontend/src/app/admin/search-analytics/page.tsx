'use client';

import {
  BarChart3, TrendingUp, Clock, Search, AlertCircle, Users,
  Smartphone, Globe, MessageSquare, Filter, ArrowUp, ArrowDown
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface SearchStats {
  totalSearches: number;
  zeroResults: number;
  zeroResultsRate: string;
  avgResponseTime: number;
  uniqueUsers: number;
  topQueries: Array<{ query: string; searchCount: number; avgResults: number; avgTimeMs: number; uniqueUsers: number }>;
}

interface ChannelData {
  platform: string;
  searches: number;
  uniqueUsers: number;
  zeroResultsRate: number;
  avgTimeMs: number;
}

interface ZeroResultQuery {
  rank: number;
  query: string;
  searchCount: number;
  uniqueUsers: number;
  firstSeen: string;
  lastSeen: string;
  priority: string;
}

interface VolumeByChannel {
  period: string;
  platform: string;
  searchCount: number;
}

type TabId = 'overview' | 'channels' | 'queries' | 'gaps';

const PLATFORM_META: Record<string, { label: string; icon: typeof Globe; color: string; bgColor: string }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600', bgColor: 'bg-green-50' },
  web: { label: 'Web', icon: Globe, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  app: { label: 'App', icon: Smartphone, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  unknown: { label: 'Unknown', icon: Search, color: 'text-gray-600', bgColor: 'bg-gray-50' },
};

function getPlatformMeta(platform: string) {
  return PLATFORM_META[platform.toLowerCase()] || PLATFORM_META.unknown;
}

export default function SearchAnalyticsPage() {
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [zeroResults, setZeroResults] = useState<ZeroResultQuery[]>([]);
  const [volumeByChannel, setVolumeByChannel] = useState<VolumeByChannel[]>([]);
  const [channelQueries, setChannelQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [platformFilter, setPlatformFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashboardRes, topQueriesRes, channelsRes, zeroResultsRes, volumeRes] = await Promise.all([
          adminBackendClient.getSearchDashboard(days),
          adminBackendClient.getTopQueries(days, 20),
          adminBackendClient.getSearchChannels(days),
          adminBackendClient.getZeroResultQueries(days, 20),
          adminBackendClient.getSearchVolumeByChannel(days, 'day'),
        ]);

        const dashboard = dashboardRes as any;
        const topQueries = topQueriesRes as any;
        const channelsData = channelsRes as any;
        const zeroData = zeroResultsRes as any;
        const volumeData = volumeRes as any;

        if (dashboard.success) {
          setStats({
            totalSearches: dashboard.data.metrics.totalSearches,
            zeroResults: dashboard.data.metrics.zeroResults,
            zeroResultsRate: dashboard.data.metrics.zeroResultsRate,
            avgResponseTime: dashboard.data.performance.avgResponseTimeMs,
            uniqueUsers: dashboard.data.metrics.uniqueUsers || 0,
            topQueries: topQueries.success ? topQueries.data.queries : [],
          });
        } else {
          throw new Error(dashboard.error || 'Failed to fetch analytics data');
        }

        if (channelsData.success) {
          setChannels(channelsData.data.channels || []);
        }
        if (zeroData.success) {
          setZeroResults(zeroData.data.queries || []);
        }
        if (volumeData.success) {
          setVolumeByChannel(volumeData.data.volume || []);
        }
      } catch (err: any) {
        console.error('Error fetching stats:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days]);

  // Fetch channel-filtered queries when platform filter changes
  useEffect(() => {
    if (activeTab === 'queries' || activeTab === 'channels') {
      adminBackendClient.getTopQueriesByChannel(days, platformFilter !== 'all' ? platformFilter : undefined, 20)
        .then((res: any) => {
          if (res.success) setChannelQueries(res.data.queries || []);
        })
        .catch(() => {});
    }
  }, [days, platformFilter, activeTab]);

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

  const totalChannelSearches = channels.reduce((s, c) => s + c.searches, 0);

  const tabs: { id: TabId; label: string; icon: typeof Search }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'channels', label: 'Channel Insights', icon: Users },
    { id: 'queries', label: 'Top Queries', icon: Search },
    { id: 'gaps', label: 'Gap Analysis', icon: AlertCircle },
  ];

  // Aggregate volume by date for the simple trend line
  const dailyVolume = Object.entries(
    volumeByChannel.reduce((acc, v) => {
      const d = new Date(v.period).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      acc[d] = (acc[d] || 0) + v.searchCount;
      return acc;
    }, {} as Record<string, number>)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 size={32} />
              <h1 className="text-3xl font-bold">Search Analytics</h1>
            </div>
            <p className="text-blue-100">
              Monitor search performance and channel insights (Last {days} Days)
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <>
          {/* KPI Cards */}
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
                <Users className="text-green-600" size={24} />
                <span className="text-sm font-medium text-gray-500">Unique Users</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {stats?.uniqueUsers?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {stats && stats.uniqueUsers > 0
                  ? `${(stats.totalSearches / stats.uniqueUsers).toFixed(1)} searches/user`
                  : 'No data'}
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle className="text-orange-600" size={24} />
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

          {/* Channel Breakdown Donut + Volume Trend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Channel Breakdown */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Channel Breakdown</h2>
              {channels.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No channel data yet</p>
              ) : (
                <div className="space-y-3">
                  {channels.map(ch => {
                    const meta = getPlatformMeta(ch.platform);
                    const pct = totalChannelSearches > 0 ? (ch.searches / totalChannelSearches * 100) : 0;
                    return (
                      <div key={ch.platform} className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${meta.bgColor}`}>
                          <meta.icon size={18} className={meta.color} />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-800">{meta.label}</span>
                            <span className="text-gray-500">{ch.searches.toLocaleString()} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Daily Volume Trend */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Volume Trend</h2>
              {dailyVolume.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No volume data yet</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const maxCount = Math.max(...dailyVolume.map(([, c]) => c), 1);
                    return dailyVolume.map(([date, count]) => (
                      <div key={date} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16 text-right">{date}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded transition-all"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-10">{count}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Top Queries */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Search Queries</h2>
            {!stats?.topQueries?.length ? (
              <div className="text-center py-8 text-gray-500">No search data available yet</div>
            ) : (
              <div className="space-y-3">
                {stats.topQueries.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold w-8 ${index < 3 ? 'text-yellow-500' : 'text-gray-400'}`}>
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-gray-900">{item.query}</div>
                        <div className="text-xs text-gray-500">
                          Avg {item.avgResults} results | {item.avgTimeMs}ms | {item.uniqueUsers} users
                        </div>
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
        </>
      )}

      {/* ===== CHANNEL INSIGHTS TAB ===== */}
      {activeTab === 'channels' && (
        <>
          {/* Channel Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {channels.map(ch => {
              const meta = getPlatformMeta(ch.platform);
              return (
                <div key={ch.platform} className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-xl ${meta.bgColor}`}>
                      <meta.icon size={24} className={meta.color} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{meta.label}</h3>
                      <p className="text-sm text-gray-500">{ch.platform}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{ch.searches.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Searches</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{ch.uniqueUsers.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">Unique Users</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{(ch.zeroResultsRate * 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">Zero Results</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{ch.avgTimeMs}ms</div>
                      <div className="text-xs text-gray-500">Avg Time</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {channels.length === 0 && (
              <div className="col-span-3 bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center text-gray-500">
                No channel data available. Searches will be tagged with platform once traffic flows through.
              </div>
            )}
          </div>

          {/* Channel Comparison Table */}
          {channels.length > 0 && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Channel Comparison</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="pb-3 font-medium">Channel</th>
                      <th className="pb-3 font-medium">Searches</th>
                      <th className="pb-3 font-medium">Users</th>
                      <th className="pb-3 font-medium">Searches/User</th>
                      <th className="pb-3 font-medium">Zero Results</th>
                      <th className="pb-3 font-medium">Avg Time</th>
                      <th className="pb-3 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map(ch => {
                      const meta = getPlatformMeta(ch.platform);
                      const pct = totalChannelSearches > 0 ? (ch.searches / totalChannelSearches * 100) : 0;
                      return (
                        <tr key={ch.platform} className="border-b border-gray-100">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <meta.icon size={16} className={meta.color} />
                              <span className="font-medium text-gray-900">{meta.label}</span>
                            </div>
                          </td>
                          <td className="py-3 text-gray-900 font-medium">{ch.searches.toLocaleString()}</td>
                          <td className="py-3 text-gray-700">{ch.uniqueUsers.toLocaleString()}</td>
                          <td className="py-3 text-gray-700">
                            {ch.uniqueUsers > 0 ? (ch.searches / ch.uniqueUsers).toFixed(1) : '-'}
                          </td>
                          <td className="py-3">
                            <span className={ch.zeroResultsRate > 0.1 ? 'text-red-600 font-medium' : 'text-gray-700'}>
                              {(ch.zeroResultsRate * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 text-gray-700">{ch.avgTimeMs}ms</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-gray-600">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Volume by Channel Stacked Bars */}
          {volumeByChannel.length > 0 && (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Volume by Channel</h2>
              <div className="space-y-2">
                {(() => {
                  // Group by date
                  const byDate: Record<string, Record<string, number>> = {};
                  for (const v of volumeByChannel) {
                    const d = new Date(v.period).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                    if (!byDate[d]) byDate[d] = {};
                    byDate[d][v.platform] = v.searchCount;
                  }
                  const dates = Object.entries(byDate);
                  const maxTotal = Math.max(...dates.map(([, platforms]) => Object.values(platforms).reduce((s, c) => s + c, 0)), 1);
                  const colors: Record<string, string> = { whatsapp: 'bg-green-400', web: 'bg-blue-400', app: 'bg-purple-400', unknown: 'bg-gray-400' };

                  return dates.map(([date, platforms]) => {
                    const total = Object.values(platforms).reduce((s, c) => s + c, 0);
                    return (
                      <div key={date} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16 text-right">{date}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden flex">
                          {Object.entries(platforms).map(([plat, count]) => (
                            <div
                              key={plat}
                              className={`h-full ${colors[plat] || colors.unknown}`}
                              style={{ width: `${(count / maxTotal) * 100}%` }}
                              title={`${getPlatformMeta(plat).label}: ${count}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-600 w-10">{total}</span>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex gap-4 mt-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded" />WhatsApp</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" />Web</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-400 rounded" />App</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-400 rounded" />Unknown</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TOP QUERIES TAB ===== */}
      {activeTab === 'queries' && (
        <>
          {/* Platform Filter */}
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-gray-500" />
            <span className="text-sm text-gray-600">Platform:</span>
            {['all', 'whatsapp', 'web', 'app'].map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  platformFilter === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p === 'all' ? 'All' : getPlatformMeta(p).label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top Queries {platformFilter !== 'all' && `(${getPlatformMeta(platformFilter).label})`}
            </h2>
            {channelQueries.length === 0 ? (
              <p className="text-center py-8 text-gray-500">No query data for this filter</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="pb-3 font-medium w-12">#</th>
                      <th className="pb-3 font-medium">Query</th>
                      <th className="pb-3 font-medium">Searches</th>
                      <th className="pb-3 font-medium">Avg Results</th>
                      <th className="pb-3 font-medium">Avg Time</th>
                      <th className="pb-3 font-medium">Users</th>
                      <th className="pb-3 font-medium">Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelQueries.map((q: any) => {
                      const meta = getPlatformMeta(q.platform || 'unknown');
                      return (
                        <tr key={`${q.rank}-${q.query}`} className="border-b border-gray-100">
                          <td className="py-3">
                            <span className={`font-bold ${q.rank <= 3 ? 'text-yellow-500' : 'text-gray-400'}`}>
                              {q.rank}
                            </span>
                          </td>
                          <td className="py-3 font-medium text-gray-900">{q.query}</td>
                          <td className="py-3 text-gray-700">{q.searchCount}</td>
                          <td className="py-3 text-gray-700">{q.avgResults}</td>
                          <td className="py-3 text-gray-700">{q.avgTimeMs}ms</td>
                          <td className="py-3 text-gray-700">{q.uniqueUsers}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${meta.bgColor} ${meta.color}`}>
                              <meta.icon size={12} />
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== GAP ANALYSIS TAB ===== */}
      {activeTab === 'gaps' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Zero-Result Queries</h2>
            <p className="text-sm text-gray-500 mt-1">
              These queries returned no results. Consider adding items or synonyms to improve coverage.
            </p>
          </div>
          {zeroResults.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No zero-result queries found. Great coverage!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-3 font-medium w-12">#</th>
                    <th className="pb-3 font-medium">Query</th>
                    <th className="pb-3 font-medium">Times Searched</th>
                    <th className="pb-3 font-medium">Users</th>
                    <th className="pb-3 font-medium">First Seen</th>
                    <th className="pb-3 font-medium">Last Seen</th>
                    <th className="pb-3 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroResults.map((q) => (
                    <tr key={q.query} className="border-b border-gray-100">
                      <td className="py-3 text-gray-400 font-bold">{q.rank}</td>
                      <td className="py-3 font-medium text-gray-900">{q.query}</td>
                      <td className="py-3 text-gray-700">{q.searchCount}</td>
                      <td className="py-3 text-gray-700">{q.uniqueUsers}</td>
                      <td className="py-3 text-gray-500 text-xs">
                        {new Date(q.firstSeen).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 text-gray-500 text-xs">
                        {new Date(q.lastSeen).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          q.priority === 'high' ? 'bg-red-100 text-red-700' :
                          q.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {q.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
