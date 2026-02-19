'use client';

import { useState, useEffect } from 'react';
import { adminBackendClient } from '@/lib/api/admin-backend';
import {
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface ActivityLog {
  id: number;
  admin_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
  action: string;
  module: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-green-100 text-green-800',
  login_failed: 'bg-red-100 text-red-800',
  forgot_password: 'bg-yellow-100 text-yellow-800',
  otp_verified: 'bg-blue-100 text-blue-800',
  password_reset: 'bg-purple-100 text-purple-800',
  profile_viewed: 'bg-gray-100 text-gray-700',
  create_admin: 'bg-blue-100 text-blue-800',
  update_role: 'bg-orange-100 text-orange-800',
  deactivate_admin: 'bg-red-100 text-red-800',
};

const ACTIONS = [
  'login',
  'login_failed',
  'forgot_password',
  'otp_verified',
  'password_reset',
  'profile_viewed',
  'create_admin',
  'update_role',
  'deactivate_admin',
];

const PAGE_SIZE = 25;

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    loadLogs();
  }, [filterAction, page]);

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminBackendClient.getActivityLog({
        action: filterAction || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (result.success) {
        setLogs(result.logs as unknown as ActivityLog[]);
        setTotal(result.total);
      } else {
        setError('Failed to load activity log');
      }
    } catch {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDetails = (details: Record<string, unknown>) => {
    if (!details || Object.keys(details).length === 0) return '-';
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-sm text-gray-500 mt-1">
            Admin actions and login history ({total} entries)
          </p>
        </div>
        <button
          onClick={() => { setPage(0); loadLogs(); }}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter size={16} className="text-gray-400" />
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
        >
          <option value="">All Actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Admin</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Module</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Details</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">IP</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 text-xs">
                          {log.admin_name || 'Unknown'}
                        </p>
                        <p className="text-gray-400 text-xs">
                          {log.admin_email || '-'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{log.module}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {formatDetails(log.details)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {log.ip_address || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      <Activity className="mx-auto mb-2" size={32} />
                      No activity logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-gray-600 px-2">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
