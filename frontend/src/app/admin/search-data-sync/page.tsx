'use client';

import { useState, useEffect } from 'react';
import { 
  RefreshCw, Database, CheckCircle2, AlertCircle, Clock,
  Play, Pause, SkipForward, Settings, Activity, BarChart3
} from 'lucide-react';

interface SyncStatus {
  module: string;
  status: 'syncing' | 'idle' | 'error' | 'success';
  last_sync: string;
  items_synced: number;
  items_pending: number;
  progress: number;
}

export default function SearchDataSyncPage() {
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([
    { module: 'food', status: 'success', last_sync: '2 mins ago', items_synced: 1500, items_pending: 0, progress: 100 },
    { module: 'ecom', status: 'idle', last_sync: '1 hour ago', items_synced: 28945, items_pending: 15, progress: 100 },
    { module: 'parcel', status: 'idle', last_sync: '30 mins ago', items_synced: 342, items_pending: 0, progress: 100 },
  ]);

  const [autoSync, setAutoSync] = useState(true);

  const handleSyncModule = (module: string) => {
    setSyncStatuses(prev => prev.map(s => 
      s.module === module ? { ...s, status: 'syncing' as const, progress: 0 } : s
    ));

    setTimeout(() => {
      setSyncStatuses(prev => prev.map(s => 
        s.module === module ? { ...s, status: 'success' as const, progress: 100, last_sync: 'Just now' } : s
      ));
    }, 3000);
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
              Sync data from MySQL to OpenSearch in real-time
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Auto Sync</span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {syncStatuses.map((sync) => (
          <div key={sync.module} className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold capitalize">{sync.module}</h3>
              {sync.status === 'success' && <CheckCircle2 className="text-green-600" size={20} />}
              {sync.status === 'syncing' && <RefreshCw className="text-blue-600 animate-spin" size={20} />}
              {sync.status === 'error' && <AlertCircle className="text-red-600" size={20} />}
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items Synced:</span>
                <span className="font-semibold">{sync.items_synced.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Pending:</span>
                <span className="font-semibold">{sync.items_pending}</span>
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
                onClick={() => handleSyncModule(sync.module)}
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

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Sync Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sync Interval</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option>Every 5 minutes</option>
              <option>Every 15 minutes</option>
              <option>Every 30 minutes</option>
              <option>Every hour</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Batch Size</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option>100 items</option>
              <option>500 items</option>
              <option>1000 items</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
