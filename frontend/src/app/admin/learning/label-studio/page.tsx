'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Upload,
  Download,
  Database,
  Activity,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface ConnectionStatus {
  ok: boolean;
  projectsCount?: number;
  error?: string;
}

interface Dataset {
  id: string;
  name: string;
  type: string;
  module: string;
  exampleCount: number;
  createdAt: string;
}

interface SyncResult {
  success: boolean;
  message: string;
}

export default function LabelStudioPage() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushingDataset, setPushingDataset] = useState<string | null>(null);
  const [pullingDataset, setPullingDataset] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lsUrl, setLsUrl] = useState('');

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/settings/labelstudio/test');
      const data = await response.json();
      setConnection(data);
    } catch (error) {
      setConnection({ ok: false, error: 'Failed to reach backend' });
    } finally {
      setTesting(false);
    }
  }, []);

  const loadDatasets = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/learning/datasets');
      const data = await response.json();
      setDatasets(Array.isArray(data) ? data : data.datasets || []);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      const urlSetting = (Array.isArray(data) ? data : []).find(
        (s: { key: string }) => s.key === 'label-studio-url'
      );
      if (urlSetting) setLsUrl(urlSetting.value);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([testConnection(), loadDatasets(), loadSettings()]).finally(() =>
      setLoading(false)
    );
  }, [testConnection, loadDatasets, loadSettings]);

  const syncLabelStudio = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/admin/learning/labelstudio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      setSyncResult(data);
      await loadDatasets();
    } catch (error) {
      setSyncResult({ success: false, message: 'Sync request failed' });
    } finally {
      setSyncing(false);
    }
  };

  const pushToLabelStudio = async (datasetId: string) => {
    setPushingDataset(datasetId);
    try {
      const response = await fetch(
        `/api/admin/learning/datasets/${datasetId}/push-labelstudio`,
        { method: 'POST' }
      );
      const data = await response.json();
      setSyncResult({
        success: true,
        message: `Pushed ${data.pushed || 0} examples to Label Studio project #${data.projectId || '?'}`,
      });
    } catch (error) {
      setSyncResult({ success: false, message: 'Push failed' });
    } finally {
      setPushingDataset(null);
    }
  };

  const pullFromLabelStudio = async (datasetId: string) => {
    setPullingDataset(datasetId);
    try {
      const response = await fetch(
        `/api/admin/learning/datasets/${datasetId}/pull-labelstudio`,
        { method: 'POST' }
      );
      const data = await response.json();
      setSyncResult({
        success: true,
        message: `Imported ${data.imported || 0} annotations from Label Studio`,
      });
      await loadDatasets();
    } catch (error) {
      setSyncResult({ success: false, message: 'Pull failed' });
    } finally {
      setPullingDataset(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-400">Loading Label Studio integration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Label Studio Integration</h1>
          <p className="text-gray-400 mt-1">
            Manage training data annotation with Label Studio
          </p>
        </div>
        <div className="flex gap-2">
          {lsUrl && (
            <a
              href={lsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Label Studio
            </a>
          )}
          <button
            onClick={syncLabelStudio}
            disabled={syncing || !connection?.ok}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync All
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Connection Status</h2>
          </div>
          <button
            onClick={testConnection}
            disabled={testing}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm transition-colors"
          >
            {testing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Test
          </button>
        </div>
        <div className="mt-4 flex items-center gap-4">
          {connection?.ok ? (
            <>
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Connected</span>
              </div>
              <span className="text-gray-400">
                {connection.projectsCount} project{connection.projectsCount !== 1 ? 's' : ''} found
              </span>
              {lsUrl && <span className="text-gray-500 text-sm">{lsUrl}</span>}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">Not Connected</span>
              </div>
              <span className="text-gray-500 text-sm">
                {connection?.error || 'Configure Label Studio URL and API token in Settings'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg border ${
            syncResult.success
              ? 'bg-green-900/20 border-green-700 text-green-300'
              : 'bg-red-900/20 border-red-700 text-red-300'
          }`}
        >
          {syncResult.success ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{syncResult.message}</span>
          <button
            onClick={() => setSyncResult(null)}
            className="ml-auto text-gray-400 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Datasets Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Training Datasets</h2>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Push datasets to Label Studio for annotation, then pull back completed annotations
          </p>
        </div>

        {datasets.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No training datasets found</p>
            <p className="text-sm mt-1">
              Create datasets in the Training Data section first
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="px-6 py-3 font-medium">Dataset</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Module</th>
                  <th className="px-6 py-3 font-medium">Examples</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {datasets.map((ds) => (
                  <tr key={ds.id} className="hover:bg-gray-750">
                    <td className="px-6 py-4">
                      <span className="text-white font-medium">{ds.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-900/30 text-blue-300 border border-blue-700">
                        {ds.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{ds.module}</td>
                    <td className="px-6 py-4 text-gray-300">{ds.exampleCount}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {new Date(ds.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => pushToLabelStudio(ds.id)}
                          disabled={!connection?.ok || pushingDataset === ds.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 text-purple-300 border border-purple-700 rounded-lg hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                        >
                          {pushingDataset === ds.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                          Push
                        </button>
                        <button
                          onClick={() => pullFromLabelStudio(ds.id)}
                          disabled={!connection?.ok || pullingDataset === ds.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 text-green-300 border border-green-700 rounded-lg hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                        >
                          {pullingDataset === ds.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Pull
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Workflow Guide */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Annotation Workflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { step: '1', title: 'Create Dataset', desc: 'Upload or generate training data in Training Data section' },
            { step: '2', title: 'Push to Label Studio', desc: 'Send examples to Label Studio for annotation' },
            { step: '3', title: 'Annotate', desc: 'Label examples in Label Studio UI (intents, entities)' },
            { step: '4', title: 'Pull Annotations', desc: 'Import completed annotations back into the system' },
            { step: '5', title: 'Retrain Model', desc: 'Use annotated data to retrain NLU/NER models' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-600/20 border border-blue-700 flex items-center justify-center text-blue-300 font-bold">
                {item.step}
              </div>
              <h3 className="text-white font-medium text-sm">{item.title}</h3>
              <p className="text-gray-400 text-xs mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
