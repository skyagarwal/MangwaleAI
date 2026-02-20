'use client';

import { useState, useEffect, useCallback } from 'react';
import { RoleGuard } from '@/components/shared';
import {
  Server, Zap, Settings, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Cpu, HardDrive,
  Activity, Eye, Terminal
} from 'lucide-react';
import { useToast } from '@/components/shared';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface VllmStatus {
  status: 'healthy' | 'unhealthy' | 'offline';
  model: string | null;
  latency: number | null;
}

export default function VllmSettingsPage() {
  const toast = useToast();
  const [vllmStatus, setVllmStatus] = useState<VllmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // vLLM Config
  const [vllmConfig, setVllmConfig] = useState({
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
    topK: 50,
  });

  const loadVllmStatus = useCallback(async () => {
    try {
      // Get health status from the NestJS backend (includes vLLM status + latency)
      const healthData = await adminBackendClient.getSystemHealth() as {
        services?: {
          vllm?: { status: string; latency?: number };
        };
      };
      const vllmHealth = healthData?.services?.vllm;
      const isUp = vllmHealth?.status === 'up';

      // If vLLM is up, also fetch the model name from vLLM's OpenAI API
      let modelName: string | null = null;
      if (isUp) {
        try {
          const modelsRes = await fetch('/api/vllm/v1/models');
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            modelName = modelsData.data?.[0]?.id || null;
          }
        } catch {
          // Model name fetch failed, that's okay — we still have health info
        }
      }

      setVllmStatus({
        status: isUp ? 'healthy' : 'offline',
        model: modelName,
        latency: vllmHealth?.latency ?? null,
      });
    } catch {
      setVllmStatus({
        status: 'offline',
        model: null,
        latency: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const configData = await adminBackendClient.getConfigCategory('vllm') as {
        configs?: Array<{ key: string; value: string }>;
      };
      const configs = configData?.configs;
      if (Array.isArray(configs)) {
        const configMap: Record<string, string> = {};
        for (const c of configs) {
          configMap[c.key] = c.value;
        }
        setVllmConfig((prev) => ({
          temperature: configMap['vllm.temperature'] ? parseFloat(configMap['vllm.temperature']) : prev.temperature,
          maxTokens: configMap['vllm.max_tokens'] ? parseInt(configMap['vllm.max_tokens'], 10) : prev.maxTokens,
          topP: configMap['vllm.top_p'] ? parseFloat(configMap['vllm.top_p']) : prev.topP,
          topK: configMap['vllm.top_k'] ? parseInt(configMap['vllm.top_k'], 10) : prev.topK,
        }));
      }
    } catch {
      // Config not saved yet — use defaults
    }
  }, []);

  useEffect(() => {
    loadVllmStatus();
    loadConfig();
    // Refresh status every 30 seconds
    const interval = setInterval(loadVllmStatus, 30000);
    return () => clearInterval(interval);
  }, [loadVllmStatus, loadConfig]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadVllmStatus();
    setTimeout(() => setRefreshing(false), 500);
  };

  const updateVllmConfig = async () => {
    setSaving(true);
    try {
      await adminBackendClient.updateConfig('vllm.temperature', String(vllmConfig.temperature));
      await adminBackendClient.updateConfig('vllm.max_tokens', String(vllmConfig.maxTokens));
      await adminBackendClient.updateConfig('vllm.top_p', String(vllmConfig.topP));
      await adminBackendClient.updateConfig('vllm.top_k', String(vllmConfig.topK));
      toast.success('vLLM configuration saved successfully');
    } catch (error) {
      console.error('Failed to update config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status: VllmStatus['status']) => {
    switch (status) {
      case 'healthy': return <CheckCircle size={20} />;
      case 'unhealthy': return <AlertCircle size={20} />;
      case 'offline': return <XCircle size={20} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="animate-spin text-[#059211]" size={48} />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#059211] to-[#047a0e] rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Server size={32} />
              <h1 className="text-3xl font-bold">Local vLLM GPU Instance</h1>
            </div>
            <p className="text-green-100">
              Monitor and configure your local GPU-accelerated language model
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white text-[#059211] px-6 py-3 rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-xl p-6 border-2 ${
          vllmStatus?.status === 'healthy'
            ? 'bg-green-50 border-green-200'
            : vllmStatus?.status === 'offline'
            ? 'bg-red-50 border-red-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            {vllmStatus && getStatusIcon(vllmStatus.status)}
            <span className="text-sm font-medium">Status</span>
          </div>
          <div className="text-2xl font-bold capitalize">
            {vllmStatus?.status || 'Unknown'}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
          <div className="flex items-center gap-3 mb-2 text-gray-600">
            <Server size={20} />
            <span className="text-sm font-medium">Model</span>
          </div>
          <div className="text-sm font-mono text-gray-900">
            {vllmStatus?.model?.split('/').pop() || 'None'}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
          <div className="flex items-center gap-3 mb-2 text-gray-600">
            <Zap size={20} />
            <span className="text-sm font-medium">Latency</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {vllmStatus?.latency != null ? `${vllmStatus.latency} ms` : 'N/A'}
          </div>
        </div>
      </div>

      {vllmStatus?.status === 'healthy' && (
        <>
          {/* GPU Hardware Info (static — real-time metrics require nvidia-smi integration) */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Cpu size={24} className="text-[#059211]" />
              GPU Hardware
            </h2>
            <p className="text-xs text-gray-500 mb-6">
              Static hardware info. Real-time utilization, temperature, and memory metrics require nvidia-smi integration (not yet available).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* GPU Name */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-200">
                <div className="flex items-center gap-2 text-blue-700 mb-2">
                  <Cpu size={18} />
                  <span className="text-sm font-medium">GPU</span>
                </div>
                <div className="text-lg font-bold text-blue-900 mb-1">
                  NVIDIA RTX 3060
                </div>
                <div className="text-xs text-blue-700">
                  Mercury (192.168.0.151)
                </div>
              </div>

              {/* VRAM */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border-2 border-purple-200">
                <div className="flex items-center gap-2 text-purple-700 mb-2">
                  <HardDrive size={18} />
                  <span className="text-sm font-medium">VRAM</span>
                </div>
                <div className="text-lg font-bold text-purple-900 mb-1">
                  12 GB GDDR6
                </div>
                <div className="text-xs text-purple-700">
                  Total available memory
                </div>
              </div>

              {/* Model Info */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border-2 border-green-200">
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <Activity size={18} />
                  <span className="text-sm font-medium">Loaded Model</span>
                </div>
                <div className="text-sm font-bold text-green-900 mb-1 font-mono">
                  {vllmStatus.model?.split('/').pop() || 'Unknown'}
                </div>
                <div className="text-xs text-green-700">
                  Qwen2.5-7B AWQ (4-bit quantized)
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {vllmStatus?.status === 'offline' && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-8 text-center">
          <XCircle size={64} className="mx-auto mb-4 text-red-600" />
          <h3 className="text-2xl font-bold text-red-900 mb-3">
            vLLM Service Offline
          </h3>
          <p className="text-red-700 mb-6 max-w-md mx-auto">
            Unable to connect to vLLM at <code className="bg-red-100 px-2 py-1 rounded">http://localhost:8002</code>
          </p>
          <div className="bg-gray-900 text-left max-w-2xl mx-auto rounded-lg p-6 mb-6">
            <div className="text-green-400 font-mono text-sm mb-2">
              # Start vLLM container:
            </div>
            <div className="text-white font-mono text-sm">
              docker-compose up -d vllm
            </div>
          </div>
          <p className="text-sm text-gray-600">
            The page will automatically reconnect when vLLM comes online.
          </p>
        </div>
      )}

      {/* vLLM Configuration */}
      <div className="bg-white rounded-xl shadow-md border-2 border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings size={24} className="text-[#059211]" />
          <h2 className="text-xl font-bold text-gray-900">Model Configuration</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">
                Temperature
              </label>
              <span className="text-2xl font-bold text-[#059211]">
                {vllmConfig.temperature}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={vllmConfig.temperature}
              onChange={(e) => setVllmConfig({ ...vllmConfig, temperature: parseFloat(e.target.value) })}
              className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb-green"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0.0 (Deterministic)</span>
              <span>1.0 (Balanced)</span>
              <span>2.0 (Creative)</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Controls randomness. Lower = more focused, higher = more creative.
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Max Tokens: <span className="text-[#059211] font-bold">{vllmConfig.maxTokens}</span>
            </label>
            <input
              type="number"
              value={vllmConfig.maxTokens}
              onChange={(e) => setVllmConfig({ ...vllmConfig, maxTokens: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#059211] focus:outline-none text-lg font-medium"
              min="1"
              max="4096"
            />
            <p className="text-xs text-gray-600 mt-2">
              Maximum length of generated response (1-4096 tokens).
            </p>
          </div>

          {/* Top P */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">
                Top P (Nucleus Sampling)
              </label>
              <span className="text-2xl font-bold text-[#059211]">
                {vllmConfig.topP}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={vllmConfig.topP}
              onChange={(e) => setVllmConfig({ ...vllmConfig, topP: parseFloat(e.target.value) })}
              className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb-green"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0.0</span>
              <span>0.5</span>
              <span>1.0</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Cumulative probability threshold for token selection.
            </p>
          </div>

          {/* Top K */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Top K: <span className="text-[#059211] font-bold">{vllmConfig.topK}</span>
            </label>
            <input
              type="number"
              value={vllmConfig.topK}
              onChange={(e) => setVllmConfig({ ...vllmConfig, topK: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#059211] focus:outline-none text-lg font-medium"
              min="1"
              max="100"
            />
            <p className="text-xs text-gray-600 mt-2">
              Number of top tokens to consider (1-100).
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={updateVllmConfig}
            disabled={saving}
            className="flex-1 px-6 py-4 bg-gradient-to-r from-[#059211] to-[#047a0e] text-white rounded-lg hover:shadow-lg transition-all font-medium text-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            onClick={() => setVllmConfig({ temperature: 0.7, maxTokens: 2048, topP: 0.9, topK: 50 })}
            className="px-6 py-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium"
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button className="flex items-center gap-4 bg-white rounded-xl shadow-md border-2 border-gray-200 p-6 hover:border-[#059211] hover:shadow-lg transition-all">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Terminal size={24} className="text-blue-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 text-lg">View Logs</div>
            <div className="text-sm text-gray-600">Real-time vLLM output</div>
          </div>
        </button>

        <button className="flex items-center gap-4 bg-white rounded-xl shadow-md border-2 border-gray-200 p-6 hover:border-[#059211] hover:shadow-lg transition-all">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Activity size={24} className="text-purple-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 text-lg">Analytics</div>
            <div className="text-sm text-gray-600">Detailed performance metrics</div>
          </div>
        </button>

        <button className="flex items-center gap-4 bg-white rounded-xl shadow-md border-2 border-gray-200 p-6 hover:border-[#059211] hover:shadow-lg transition-all">
          <div className="p-3 bg-green-100 rounded-lg">
            <Eye size={24} className="text-green-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 text-lg">Test Model</div>
            <div className="text-sm text-gray-600">Send test requests</div>
          </div>
        </button>
      </div>

      <style jsx>{`
        .slider-thumb-green::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          background: #059211;
          cursor: pointer;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider-thumb-green::-moz-range-thumb {
          width: 24px;
          height: 24px;
          background: #059211;
          cursor: pointer;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
    </RoleGuard>
  );
}
