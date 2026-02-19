'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Database, RefreshCw, CheckCircle2, AlertCircle, XCircle, Activity, Search, TrendingUp, Clock } from 'lucide-react';
import { useToast } from '@/components/shared';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface ServiceStatus {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}

interface HealthData {
  status: string;
  services: Record<string, ServiceStatus>;
}

interface SearchMetrics {
  totalSearches: number;
  uniqueUsers: number;
  searchesPerUser: string;
  zeroResults: number;
  zeroResultsRate: string;
}

interface PerformanceMetrics {
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
}

export default function SearchConfigPage() {
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [searchMetrics, setSearchMetrics] = useState<SearchMetrics | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [trendDirection, setTrendDirection] = useState<string>('flat');
  const [growthRate, setGrowthRate] = useState<string>('0%');
  const [period, setPeriod] = useState(7);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, dashboardRes] = await Promise.all([
        adminBackendClient.getSystemHealth().catch(() => null),
        adminBackendClient.getSearchDashboard(period).catch(() => null),
      ]);

      if (healthRes) {
        setHealth(healthRes as unknown as HealthData);
      }

      if (dashboardRes && (dashboardRes as any).success) {
        const data = (dashboardRes as any).data;
        setSearchMetrics(data.metrics);
        setPerformance(data.performance);
        setTrendDirection(data.trends?.direction || 'flat');
        setGrowthRate(data.trends?.growthRate || '0%');
      }
    } catch (err) {
      console.error('Failed to fetch search config data:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const services = health?.services
    ? [
        { key: 'search_api', label: 'Search API', description: 'OpenSearch proxy (port 3100)' },
        { key: 'nlu', label: 'NLU Service', description: 'Intent classification (Mercury)' },
        { key: 'ner', label: 'NER Service', description: 'Entity extraction (Mercury)' },
        { key: 'database', label: 'PostgreSQL', description: 'Primary database' },
        { key: 'redis', label: 'Redis', description: 'Session cache' },
        { key: 'php_backend', label: 'PHP Backend', description: 'Orders & auth' },
        { key: 'vllm', label: 'vLLM', description: 'Local LLM inference' },
        { key: 'asr', label: 'ASR', description: 'Speech-to-text' },
        { key: 'tts', label: 'TTS', description: 'Text-to-speech' },
      ]
    : [];

  const getStatusIcon = (status?: string) => {
    if (status === 'up') return <CheckCircle2 size={18} className="text-green-600" />;
    if (status === 'down') return <XCircle size={18} className="text-red-600" />;
    return <AlertCircle size={18} className="text-yellow-600" />;
  };

  const getOverallStatus = () => {
    if (!health) return 'unknown';
    return health.status === 'ok' ? 'healthy' : 'degraded';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Settings size={32} />
              <h1 className="text-3xl font-bold">Search Configuration</h1>
            </div>
            <p className="text-cyan-100">
              System health, search analytics, and service monitoring
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setPeriod(d)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === d
                ? 'bg-cyan-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Search Metrics */}
      {searchMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
              <Search size={16} />
              Total Searches
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {searchMetrics.totalSearches.toLocaleString()}
            </div>
            <div className={`text-xs mt-1 ${trendDirection === 'up' ? 'text-green-600' : trendDirection === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
              {trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '→'} {growthRate} vs prev period
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
              <TrendingUp size={16} />
              Unique Users
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {searchMetrics.uniqueUsers.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {searchMetrics.searchesPerUser} searches/user
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
              <AlertCircle size={16} />
              Zero Results
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {searchMetrics.zeroResults.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {searchMetrics.zeroResultsRate} of searches
            </div>
          </div>

          {performance && (
            <>
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                  <Clock size={16} />
                  Avg Response
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {performance.avgResponseTimeMs}ms
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  P50: {performance.p50ResponseTimeMs}ms
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5">
                <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                  <Activity size={16} />
                  P95 Latency
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {performance.p95ResponseTimeMs}ms
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  95th percentile
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && !searchMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-md border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Service Health Grid */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Database size={20} />
          System Services
          <span className={`ml-auto text-sm font-medium px-3 py-1 rounded-full ${
            getOverallStatus() === 'healthy'
              ? 'bg-green-100 text-green-700'
              : getOverallStatus() === 'degraded'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {getOverallStatus() === 'healthy' ? 'All Systems Operational' : getOverallStatus() === 'degraded' ? 'Degraded' : 'Checking...'}
          </span>
        </h2>

        {loading && !health ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {services.map(svc => {
              const svcData = health?.services?.[svc.key];
              return (
                <div key={svc.key} className="flex items-center gap-3 border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  {getStatusIcon(svcData?.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{svc.label}</div>
                    <div className="text-xs text-gray-500">{svc.description}</div>
                  </div>
                  {svcData?.latency !== undefined && svcData.latency > 0 && (
                    <span className="text-xs text-gray-400">{svcData.latency}ms</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* No data message */}
      {!loading && !searchMetrics && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <AlertCircle size={32} className="text-yellow-600 mx-auto mb-2" />
          <p className="text-yellow-800 font-medium">No search analytics data available</p>
          <p className="text-yellow-600 text-sm mt-1">
            Search logs may not be recorded yet, or the database table may not exist.
          </p>
        </div>
      )}
    </div>
  );
}
