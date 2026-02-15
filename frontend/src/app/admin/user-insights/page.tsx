'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Download,
  TrendingUp,
  Users,
  Activity,
  Brain,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface Insight {
  user_id: number;
  insight_type: string;
  insight_key: string;
  insight_value: string;
  confidence: number;
  source: string;
  extracted_at: string;
  phone?: string;
  dietary_type?: string;
  profile_completeness?: number;
}

interface InsightStats {
  totalInsights: number;
  uniqueUsers: number;
  avgConfidence: number;
  last24h: number;
  last7d: number;
  byType: Record<string, number>;
}

interface InsightType {
  type: string;
  count: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3200';

export default function UserInsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [stats, setStats] = useState<InsightStats | null>(null);
  const [insightTypes, setInsightTypes] = useState<InsightType[]>([]);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [userInsights, setUserInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [minConfidence, setMinConfidence] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalInsights, setTotalInsights] = useState(0);
  const limit = 20;

  const totalPages = Math.ceil(totalInsights / limit);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/personalization/insights/stats`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch insight stats:', err);
    }
  }, []);

  const fetchTypes = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/personalization/insights/types`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) setInsightTypes(data.types);
      }
    } catch (err) {
      console.error('Failed to fetch insight types:', err);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
      });
      if (typeFilter) params.append('type', typeFilter);
      if (minConfidence > 0) params.append('minConfidence', minConfidence.toString());
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`${API_BASE}/api/personalization/insights/all?${params}`);
      if (!response.ok) throw new Error('Failed to fetch insights');

      const data = await response.json();
      setInsights(data.insights || []);
      setTotalInsights(data.total || 0);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, typeFilter, minConfidence, searchTerm]);

  const fetchUserInsights = async (userId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/personalization/insights?userId=${userId}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setUserInsights(data.insights || []);
      }
    } catch (err) {
      console.error('Failed to fetch user insights:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTypes();
  }, [fetchStats, fetchTypes]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleRefresh = () => {
    fetchStats();
    fetchTypes();
    fetchInsights();
  };

  const handleViewInsight = (insight: Insight) => {
    setSelectedInsight(insight);
    fetchUserInsights(insight.user_id);
  };

  const handleExportCSV = () => {
    const headers = ['User ID', 'Phone', 'Type', 'Key', 'Value', 'Confidence', 'Source', 'Extracted At'];
    const csvRows = [headers.join(',')];
    insights.forEach(i => {
      csvRows.push([
        i.user_id,
        i.phone || '',
        i.insight_type,
        i.insight_key,
        JSON.stringify(i.insight_value).replace(/,/g, ';'),
        i.confidence,
        i.source,
        i.extracted_at,
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-insights-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.8) return 'text-green-700 bg-green-50';
    if (c >= 0.5) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  };

  const typeColor = (type: string) => {
    const colors: Record<string, string> = {
      favorite_store: 'bg-purple-100 text-purple-700',
      favorite_item: 'bg-blue-100 text-blue-700',
      ordered_item: 'bg-green-100 text-green-700',
      dietary: 'bg-orange-100 text-orange-700',
      communication_tone: 'bg-pink-100 text-pink-700',
      price_sensitivity: 'bg-yellow-100 text-yellow-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-[#059211]" size={28} />
            User Insights
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            AI-extracted insights from conversations and order history
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-[#059211] text-white rounded-lg hover:bg-[#047a0e] text-sm"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Brain className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalInsights.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total Insights</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.uniqueUsers.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Users Profiled</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats.avgConfidence * 100).toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Avg Confidence</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="text-orange-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.last24h}</p>
                <p className="text-xs text-gray-500">Last 24h</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-100 rounded-lg">
                <Activity className="text-teal-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.last7d}</p>
                <p className="text-xs text-gray-500">Last 7 Days</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Type Breakdown */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Insight Types</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byType).map(([type, count]) => (
              <button
                key={type}
                onClick={() => { setTypeFilter(type === typeFilter ? '' : type); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  typeFilter === type
                    ? 'bg-[#059211] text-white'
                    : typeColor(type)
                }`}
              >
                {type.replace(/_/g, ' ')} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search by phone, key, or value..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="flex-1 border-none outline-none text-sm"
          />
          {searchTerm && (
            <button onClick={() => { setSearchTerm(''); setCurrentPage(1); }}>
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All Types</option>
            {insightTypes.map(t => (
              <option key={t.type} value={t.type}>{t.type.replace(/_/g, ' ')} ({t.count})</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Min confidence:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={minConfidence * 100}
            onChange={(e) => { setMinConfidence(Number(e.target.value) / 100); setCurrentPage(1); }}
            className="w-24"
          />
          <span className="text-xs font-mono">{(minConfidence * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#059211]" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Key</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {insights.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No insights found matching your filters.
                  </td>
                </tr>
              ) : (
                insights.map((insight, idx) => (
                  <tr key={`${insight.user_id}-${insight.insight_type}-${insight.insight_key}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">#{insight.user_id}</div>
                      {insight.phone && <div className="text-xs text-gray-500">{insight.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColor(insight.insight_type)}`}>
                        {insight.insight_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[150px] truncate">
                      {insight.insight_key}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                      {typeof insight.insight_value === 'object'
                        ? JSON.stringify(insight.insight_value)
                        : String(insight.insight_value)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-mono ${confidenceColor(insight.confidence)}`}>
                        {(insight.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {insight.source}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(insight.extracted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewInsight(insight)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                        title="View details"
                      >
                        <Eye size={16} className="text-gray-400" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * limit) + 1}–{Math.min(currentPage * limit, totalInsights)} of {totalInsights}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="flex items-center px-3 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedInsight && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedInsight(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles size={20} className="text-[#059211]" />
                Insight Details
              </h2>
              <button onClick={() => setSelectedInsight(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Insight Detail */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">User ID</label>
                  <p className="font-medium">#{selectedInsight.user_id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Phone</label>
                  <p className="font-medium">{selectedInsight.phone || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Type</label>
                  <p><span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColor(selectedInsight.insight_type)}`}>{selectedInsight.insight_type.replace(/_/g, ' ')}</span></p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Confidence</label>
                  <p><span className={`px-2 py-1 rounded text-xs font-mono ${confidenceColor(selectedInsight.confidence)}`}>{(selectedInsight.confidence * 100).toFixed(0)}%</span></p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Key</label>
                  <p className="font-medium">{selectedInsight.insight_key}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Source</label>
                  <p className="text-sm">{selectedInsight.source}</p>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-500 uppercase">Value</label>
                <pre className="mt-1 p-3 bg-white rounded border text-sm overflow-x-auto">
                  {typeof selectedInsight.insight_value === 'object'
                    ? JSON.stringify(selectedInsight.insight_value, null, 2)
                    : String(selectedInsight.insight_value)}
                </pre>
              </div>
              <div className="mt-2">
                <label className="text-xs text-gray-500 uppercase">Extracted At</label>
                <p className="text-sm">{new Date(selectedInsight.extracted_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Other insights for this user */}
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              All Insights for User #{selectedInsight.user_id} ({userInsights.length})
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {userInsights.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No other insights found.</p>
              ) : (
                userInsights.map((ui, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColor(ui.insight_type)}`}>
                        {ui.insight_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-gray-700">{ui.insight_key}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-mono ${confidenceColor(ui.confidence)}`}>
                        {(ui.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(ui.extracted_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
