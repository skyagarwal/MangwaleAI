'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, Clock, CheckCircle2, XCircle, Eye, Download, Filter } from 'lucide-react';

interface QueryLog {
  id: string;
  timestamp: string;
  query: string;
  module: string;
  results_count: number;
  response_time: number;
  user_id?: string;
  ip_address: string;
  status: 'success' | 'error';
  filters?: Record<string, any>;
}

export default function SearchLogsPage() {
  const [logs, setLogs] = useState<QueryLog[]>([
    { id: '1', timestamp: '2026-01-02 15:45:23', query: 'pizza delivery', module: 'food', results_count: 45, response_time: 125, ip_address: '192.168.1.100', status: 'success' },
    { id: '2', timestamp: '2026-01-02 15:44:18', query: 'biryani', module: 'food', results_count: 32, response_time: 98, ip_address: '192.168.1.101', status: 'success' },
    { id: '3', timestamp: '2026-01-02 15:43:45', query: '', module: 'ecom', results_count: 0, response_time: 45, ip_address: '192.168.1.102', status: 'error', filters: { veg: 1 } },
  ]);

  const [selectedLog, setSelectedLog] = useState<QueryLog | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'success') return log.status === 'success';
    if (filter === 'error') return log.status === 'error';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText size={32} />
              <h1 className="text-3xl font-bold">Search Query Logs</h1>
            </div>
            <p className="text-purple-100">
              Track and analyze all search queries
            </p>
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
            <Download size={20} />
            Export
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('success')}
            className={`px-4 py-2 rounded-lg ${filter === 'success' ? 'bg-green-600 text-white' : 'bg-white text-gray-700'}`}
          >
            Success
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-4 py-2 rounded-lg ${filter === 'error' ? 'bg-red-600 text-white' : 'bg-white text-gray-700'}`}
          >
            Errors
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Results</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.timestamp}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <Search size={14} className="text-gray-400" />
                      {log.query || '<empty>'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{log.module}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.results_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {log.response_time}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {log.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs">
                        <CheckCircle2 size={12} />
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs">
                        <XCircle size={12} />
                        Error
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-purple-600 hover:text-purple-900"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full m-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Query Details</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Query:</span>
                <span className="font-semibold">{selectedLog.query || '<empty>'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Timestamp:</span>
                <span className="font-semibold">{selectedLog.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">IP Address:</span>
                <span className="font-semibold">{selectedLog.ip_address}</span>
              </div>
              {selectedLog.filters && (
                <div>
                  <span className="text-gray-600">Filters:</span>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs">
                    {JSON.stringify(selectedLog.filters, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedLog(null)}
              className="mt-4 w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
