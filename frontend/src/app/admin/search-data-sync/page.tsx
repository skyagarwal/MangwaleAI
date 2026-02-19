'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';

interface SyncStatus {
  module: string;
  moduleId: number;
  status: 'syncing' | 'idle' | 'error' | 'success';
  last_sync: string;
  items_synced: number;
  items_pending: number;
  progress: number;
}

export default function SearchDataSyncPage() {
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([
    { module: 'food', moduleId: 4, status: 'idle', last_sync: 'N/A', items_synced: 0, items_pending: 0, progress: 0 },
    { module: 'ecom', moduleId: 5, status: 'idle', last_sync: 'N/A', items_synced: 0, items_pending: 0, progress: 0 },
  ]);
  const [serviceStatus, setServiceStatus] = useState<string>('unknown');

  const loadSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/search-admin/sync/status');
      if (response.ok) {
        const data = await response.json();
        setServiceStatus(data.status || 'operational');
      }
    } catch {
      setServiceStatus('offline');
    }

    // Load stats to get item counts
    try {
      const response = await fetch('/api/search-admin/stats/system');
      if (response.ok) {
        const data = await response.json();
        setSyncStatuses(prev => prev.map(s => {
          if (s.module === 'food') {
            return { ...s, items_synced: data.opensearch?.items_total ?? 0, status: 'success', progress: 100, last_sync: new Date().toLocaleString() };
          }
          if (s.module === 'ecom') {
            return { ...s, items_synced: data.opensearch?.ecom_items_total ?? data.opensearch?.items_ecom ?? 0, status: 'success', progress: 100, last_sync: new Date().toLocaleString() };
          }
          return s;
        }));
      }
    } catch {
      // Stats unavailable
    }
  }, []);

  useEffect(() => {
    loadSyncStatus();
  }, [loadSyncStatus]);

  const handleSyncModule = async (module: string, moduleId: number) => {
    setSyncStatuses(prev => prev.map(s =>
      s.module === module ? { ...s, status: 'syncing' as const, progress: 10 } : s
    ));

    try {
      const response = await fetch(`/api/search-admin/sync/items/${moduleId}`, {
        method: 'POST',
      });

      if (response.ok) {
        setSyncStatuses(prev => prev.map(s =>
          s.module === module ? { ...s, status: 'success' as const, progress: 100, last_sync: new Date().toLocaleString() } : s
        ));
      } else {
        setSyncStatuses(prev => prev.map(s =>
          s.module === module ? { ...s, status: 'error' as const, progress: 0 } : s
        ));
      }
    } catch {
      setSyncStatuses(prev => prev.map(s =>
        s.module === module ? { ...s, status: 'error' as const, progress: 0 } : s
      ));
    }
  };

  const handleSyncAll = async () => {
    setSyncStatuses(prev => prev.map(s => ({ ...s, status: 'syncing' as const, progress: 10 })));
    try {
      const response = await fetch('/api/search-admin/sync/all', { method: 'POST' });
      if (response.ok) {
        setSyncStatuses(prev => prev.map(s => ({ ...s, status: 'success' as const, progress: 100, last_sync: new Date().toLocaleString() })));
      }
    } catch {
      setSyncStatuses(prev => prev.map(s => ({ ...s, status: 'error' as const, progress: 0 })));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <RefreshCw size={32} />
              <h1 className="text-3xl font-bold">Data Sync Management</h1>
            </div>
            <p className="text-green-100">
              Sync data from MySQL to OpenSearch via Search API (port 3100)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm ${serviceStatus === 'operational' ? 'bg-green-500' : 'bg-red-500'}`}>
              Search API: {serviceStatus}
            </span>
            <button
              onClick={handleSyncAll}
              className="px-4 py-2 bg-white text-green-700 rounded-lg hover:bg-green-50 font-medium"
            >
              Sync All
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {syncStatuses.map((sync) => (
          <div key={sync.module} className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold capitalize">{sync.module} (Module {sync.moduleId})</h3>
              {sync.status === 'success' && <CheckCircle2 className="text-green-600" size={20} />}
              {sync.status === 'syncing' && <RefreshCw className="text-blue-600 animate-spin" size={20} />}
              {sync.status === 'error' && <AlertCircle className="text-red-600" size={20} />}
              {sync.status === 'idle' && <Clock className="text-gray-400" size={20} />}
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items in OpenSearch:</span>
                <span className="font-semibold">{sync.items_synced.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Last Sync:</span>
                <span className="font-semibold">{sync.last_sync}</span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${sync.progress}%` }}
                />
              </div>

              <button
                onClick={() => handleSyncModule(sync.module, sync.moduleId)}
                disabled={sync.status === 'syncing'}
                className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} className={sync.status === 'syncing' ? 'animate-spin' : ''} />
                {sync.status === 'syncing' ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
