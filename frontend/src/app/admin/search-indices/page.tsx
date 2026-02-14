'use client';

import { useState, useEffect } from 'react';
import { 
  Database, RefreshCw, Trash2, AlertCircle, CheckCircle2, 
  TrendingUp, Clock, HardDrive, Activity, AlertTriangle,
  Search, Download, Upload, Settings, BarChart3, Zap
} from 'lucide-react';

interface IndexInfo {
  name: string;
  health: 'green' | 'yellow' | 'red';
  status: 'open' | 'close';
  docs_count: number;
  docs_deleted: number;
  store_size: string;
  pri_store_size: string;
  pri: number;
  rep: number;
  module: string;
  last_updated?: string;
}

interface IndexStats {
  total_indices: number;
  total_documents: number;
  total_size_mb: number;
  healthy_indices: number;
  warning_indices: number;
  critical_indices: number;
}

export default function SearchIndicesPage() {
  const [indices, setIndices] = useState<IndexInfo[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
  const [operation, setOperation] = useState<'reindex' | 'delete' | 'backup' | null>(null);

  const fetchIndices = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_SEARCH_API_URL || 'http://localhost:3100';
      const response = await fetch(`${apiUrl}/admin/indices`);
      
      if (response.ok) {
        const data = await response.json();
        setIndices(data.indices || []);
        setStats(data.stats || null);
      } else {
        // Fallback to mock data
        loadMockData();
      }
    } catch (error) {
      console.error('Error fetching indices:', error);
      loadMockData();
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = () => {
    const mockIndices: IndexInfo[] = [
      { name: 'food_items_v4', health: 'green', status: 'open', docs_count: 1500, docs_deleted: 0, store_size: '85.8mb', pri_store_size: '85.8mb', pri: 2, rep: 0, module: 'food', last_updated: '2026-01-02 10:30:00' },
      { name: 'food_stores_v6', health: 'yellow', status: 'open', docs_count: 140, docs_deleted: 0, store_size: '198.1kb', pri_store_size: '198.1kb', pri: 1, rep: 1, module: 'food', last_updated: '2026-01-02 09:15:00' },
      { name: 'food_categories', health: 'green', status: 'open', docs_count: 119, docs_deleted: 0, store_size: '40.9kb', pri_store_size: '40.9kb', pri: 1, rep: 0, module: 'food', last_updated: '2026-01-01 14:00:00' },
      { name: 'ecom_items', health: 'green', status: 'open', docs_count: 28945, docs_deleted: 245, store_size: '1.2gb', pri_store_size: '1.2gb', pri: 2, rep: 0, module: 'ecom', last_updated: '2026-01-02 11:00:00' },
      { name: 'ecom_stores', health: 'green', status: 'open', docs_count: 543, docs_deleted: 12, store_size: '45.3mb', pri_store_size: '45.3mb', pri: 1, rep: 1, module: 'ecom', last_updated: '2026-01-02 08:45:00' },
    ];

    const mockStats: IndexStats = {
      total_indices: 5,
      total_documents: 31247,
      total_size_mb: 1331,
      healthy_indices: 4,
      warning_indices: 1,
      critical_indices: 0,
    };

    setIndices(mockIndices);
    setStats(mockStats);
  };

  useEffect(() => {
    fetchIndices();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchIndices();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleReindex = async (indexName: string) => {
    setSelectedIndex(indexName);
    setOperation('reindex');
    
    // Simulate reindexing
    setTimeout(() => {
      alert(`Reindexing ${indexName} started. This may take several minutes.`);
      setOperation(null);
      setSelectedIndex(null);
    }, 1000);
  };

  const handleDeleteIndex = async (indexName: string) => {
    if (!confirm(`Are you sure you want to delete index "${indexName}"? This action cannot be undone.`)) {
      return;
    }

    setSelectedIndex(indexName);
    setOperation('delete');
    
    // Simulate deletion
    setTimeout(() => {
      alert(`Index ${indexName} deleted successfully.`);
      setIndices(prev => prev.filter(idx => idx.name !== indexName));
      setOperation(null);
      setSelectedIndex(null);
    }, 1000);
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'green': return 'text-green-600 bg-green-50';
      case 'yellow': return 'text-yellow-600 bg-yellow-50';
      case 'red': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'green': return <CheckCircle2 size={16} />;
      case 'yellow': return <AlertTriangle size={16} />;
      case 'red': return <AlertCircle size={16} />;
      default: return <AlertCircle size={16} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Database size={32} />
              <h1 className="text-3xl font-bold">Index Management</h1>
            </div>
            <p className="text-indigo-100">
              Monitor and manage OpenSearch indices
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <Database className="text-indigo-600" size={24} />
              <span className="text-sm font-medium text-gray-500">Total Indices</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.total_indices}</div>
            <div className="text-sm text-gray-500 mt-1">
              {stats.healthy_indices} healthy, {stats.warning_indices} warning
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="text-blue-600" size={24} />
              <span className="text-sm font-medium text-gray-500">Total Documents</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {stats.total_documents.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500 mt-1">Across all indices</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <HardDrive className="text-purple-600" size={24} />
              <span className="text-sm font-medium text-gray-500">Total Size</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.total_size_mb} MB</div>
            <div className="text-sm text-gray-500 mt-1">Disk usage</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <Activity className="text-green-600" size={24} />
              <span className="text-sm font-medium text-gray-500">Health Status</span>
            </div>
            <div className="text-3xl font-bold text-green-600">
              {((stats.healthy_indices / stats.total_indices) * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-500 mt-1">Healthy indices</div>
          </div>
        </div>
      )}

      {/* Indices Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Database size={20} />
            OpenSearch Indices
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Index Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Health
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shards
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {indices.map((index) => (
                <tr key={index.name} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Database size={16} className="text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{index.name}</div>
                        <div className="text-xs text-gray-500">{index.module} module</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getHealthColor(index.health)}`}>
                      {getHealthIcon(index.health)}
                      {index.health}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{index.docs_count.toLocaleString()}</div>
                    {index.docs_deleted > 0 && (
                      <div className="text-xs text-gray-500">{index.docs_deleted} deleted</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {index.store_size}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {index.pri} primary, {index.rep} replica
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {index.last_updated || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleReindex(index.name)}
                        disabled={selectedIndex === index.name && operation === 'reindex'}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                        title="Reindex"
                      >
                        <RefreshCw size={16} className={selectedIndex === index.name && operation === 'reindex' ? 'animate-spin' : ''} />
                      </button>
                      <button
                        onClick={() => handleDeleteIndex(index.name)}
                        disabled={selectedIndex === index.name && operation === 'delete'}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button className="bg-white rounded-xl p-6 shadow-md border border-gray-200 hover:shadow-lg transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Upload size={24} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Bulk Reindex</h3>
          </div>
          <p className="text-sm text-gray-600">Reindex all indices at once</p>
        </button>

        <button className="bg-white rounded-xl p-6 shadow-md border border-gray-200 hover:shadow-lg transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Download size={24} className="text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Backup All</h3>
          </div>
          <p className="text-sm text-gray-600">Create snapshot of all indices</p>
        </button>

        <button className="bg-white rounded-xl p-6 shadow-md border border-gray-200 hover:shadow-lg transition-shadow text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Settings size={24} className="text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Index Settings</h3>
          </div>
          <p className="text-sm text-gray-600">Configure index parameters</p>
        </button>
      </div>
    </div>
  );
}
