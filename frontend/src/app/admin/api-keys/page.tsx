'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/shared';

interface APIKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsed?: string;
  createdAt: string;
  expiresAt?: string;
}

export default function APIKeysPage() {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['read']);
  const toast = useToast();

  const loadApiKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/api-keys');
      if (!response.ok) throw new Error('Failed to fetch API keys');
      const data = await response.json();
      setApiKeys(Array.isArray(data) ? data : data.keys || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
      setError('Failed to load API keys. The backend endpoint may not be available yet.');
      setApiKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const createKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, permissions: newKeyPermissions }),
      });

      if (!response.ok) throw new Error('Failed to create API key');

      toast.success('API key created successfully');
      setShowCreateModal(false);
      setNewKeyName('');
      setNewKeyPermissions(['read']);
      loadApiKeys();
    } catch (err) {
      console.error('Failed to create API key:', err);
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Are you sure? This action cannot be undone.')) return;

    try {
      const response = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete API key');
      toast.success('API key deleted');
      loadApiKeys();
    } catch (err) {
      console.error('Failed to delete API key:', err);
      toast.error('Failed to delete API key');
    }
  };

  const rotateKey = async (id: string) => {
    if (!confirm('Are you sure you want to rotate this key? The old key will stop working immediately.')) return;

    try {
      const response = await fetch(`/api/admin/api-keys/${id}/rotate`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to rotate API key');
      toast.success('API key rotated successfully');
      loadApiKeys();
    } catch (err) {
      console.error('Failed to rotate API key:', err);
      toast.error('Failed to rotate API key');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Key size={32} />
              <h1 className="text-3xl font-bold">API Keys</h1>
            </div>
            <p className="text-amber-100">
              Manage API keys for programmatic access to your platform
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadApiKeys}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-white text-amber-600 px-6 py-3 rounded-lg font-medium hover:shadow-lg transition-all"
            >
              <Plus size={20} />
              Create API Key
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-amber-600 flex-shrink-0" size={20} />
          <p className="text-amber-800 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-amber-600" size={48} />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-12 text-center">
          <Key className="mx-auto mb-4 text-gray-300" size={48} />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No API Keys</h3>
          <p className="text-gray-600 mb-4">
            Create your first API key to enable programmatic access
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all"
          >
            <Plus size={20} />
            Create API Key
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {apiKeys.map(apiKey => (
            <div key={apiKey.id} className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{apiKey.name}</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <code className="flex-1 text-sm bg-gray-50 px-4 py-2 rounded font-mono">
                      {showKey === apiKey.id ? apiKey.key : apiKey.key.substring(0, 8) + '...' + '\u2022'.repeat(32)}
                    </code>
                    <button
                      onClick={() => setShowKey(showKey === apiKey.id ? null : apiKey.id)}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                    >
                      {showKey === apiKey.id ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button
                      onClick={() => copyKey(apiKey.key)}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {apiKey.permissions.map(perm => (
                      <span key={perm} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                        {perm}
                      </span>
                    ))}
                  </div>
                  <div className="text-sm text-gray-600">
                    Created {formatDate(apiKey.createdAt) || 'Unknown'}
                    {apiKey.lastUsed && ` \u2022 Last used ${formatDate(apiKey.lastUsed)}`}
                    {apiKey.expiresAt && ` \u2022 Expires ${formatDate(apiKey.expiresAt)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => rotateKey(apiKey.id)}
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                    title="Rotate key"
                  >
                    <RefreshCw size={18} className="text-gray-600" />
                  </button>
                  <button
                    onClick={() => deleteKey(apiKey.id)}
                    className="p-2 hover:bg-red-50 rounded transition-colors"
                    title="Delete key"
                  >
                    <Trash2 size={18} className="text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create API Key</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production API"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                <div className="flex gap-3">
                  {['read', 'write', 'admin'].map(perm => (
                    <label key={perm} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newKeyPermissions.includes(perm)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewKeyPermissions(prev => [...prev, perm]);
                          } else {
                            setNewKeyPermissions(prev => prev.filter(p => p !== perm));
                          }
                        }}
                        className="rounded text-amber-600"
                      />
                      <span className="text-sm capitalize">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName('');
                  setNewKeyPermissions(['read']);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
