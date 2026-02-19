'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminBackendClient } from '@/lib/api/admin-backend';
import { 
  Brain, 
  Play, 
  Square, 
  RefreshCw, 
  Server, 
  Cpu, 
  HardDrive,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Rocket,
  Activity,
  BarChart3,
  Zap,
  Settings,
  Download
} from 'lucide-react';

interface TrainingJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  started_at?: string;
  completed_at?: string;
  results?: {
    accuracy: number;
    f1_macro: number;
    f1_weighted: number;
  };
  error?: string;
}

interface NLUHealth {
  status: string;
  encoder: string;
  intent_count: number;
  encoder_loaded: boolean;
  intent_loaded: boolean;
}

interface TrainingServerStatus {
  status: string;
  gpu_available: boolean;
  gpu_info?: {
    name: string;
    memory_total: string;
    memory_allocated: string;
    memory_cached: string;
  };
  active_training_jobs: number;
  models_dir: string;
}

interface ModelInfo {
  name: string;
  path: string;
  size_mb: number;
  config?: {
    accuracy?: number;
    num_labels?: number;
    training_samples?: number;
    epochs?: number;
    trained_at?: string;
  };
}

export default function NLUTrainingPage() {
  const [mercuryHealth, setMercuryHealth] = useState<NLUHealth | null>(null);
  const [jupiterHealth, setJupiterHealth] = useState<NLUHealth | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<TrainingServerStatus | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentJob, setCurrentJob] = useState<TrainingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [trainingInProgress, setTrainingInProgress] = useState(false);
  const [deployingModel, setDeployingModel] = useState<string | null>(null);
  
  // Training config
  const [epochs, setEpochs] = useState(5);
  const [batchSize, setBatchSize] = useState(16);
  const [learningRate, setLearningRate] = useState(0.00003);
  
  // All calls go through the NestJS backend proxy to avoid CORS issues.
  // The backend proxies to Mercury (192.168.0.151) training server.

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch NLU health (Mercury + Training Server) via backend proxy
      try {
        const healthData = await adminBackendClient.getNluHealth() as any;
        const data = healthData.data || healthData;
        if (data.mercury_nlu) {
          const m = data.mercury_nlu;
          if (m.status === 'ok' || m.status === 'healthy') {
            setMercuryHealth({
              status: m.status,
              encoder: m.encoder || m.model || 'IndicBERTv2',
              intent_count: m.intent_count || 33,
              encoder_loaded: m.encoder_loaded !== false,
              intent_loaded: m.intent_loaded !== false,
            });
          } else {
            setMercuryHealth(null);
          }
        } else {
          setMercuryHealth(null);
        }
        // Jupiter is same-host fallback, show as secondary
        setJupiterHealth(null);
      } catch {
        setMercuryHealth(null);
        setJupiterHealth(null);
      }

      // Fetch Training Server status via backend proxy
      try {
        const tsData = await adminBackendClient.getTrainingServerStatus() as any;
        const data = tsData.data || tsData;
        if (data && data.status) {
          setTrainingStatus(data);
          setTrainingInProgress(data.active_training_jobs > 0);
        } else {
          setTrainingStatus(null);
        }
      } catch {
        setTrainingStatus(null);
      }

      // Fetch available models via backend proxy
      try {
        const modelsData = await adminBackendClient.getAvailableModels() as any;
        const data = modelsData.data || modelsData;
        setModels(Array.isArray(data) ? data : data.models || []);
      } catch {
        setModels([]);
      }

      // Check for active training job via backend proxy
      try {
        const historyData = await adminBackendClient.getTrainingHistory() as any;
        const history = historyData.data || historyData;
        if (Array.isArray(history) && history.length > 0) {
          const latest = history[0];
          if (latest.status === 'running' || latest.status === 'queued') {
            setCurrentJob({
              job_id: latest.id || latest.model_version || 'unknown',
              status: latest.status,
              progress: latest.progress || 0,
              message: latest.notes || 'Training in progress',
            });
            setTrainingInProgress(true);
          } else {
            setCurrentJob({
              job_id: latest.id || latest.model_version || 'unknown',
              status: latest.status || 'completed',
              progress: 100,
              message: latest.notes || 'Completed',
              results: latest.accuracy ? {
                accuracy: latest.accuracy,
                f1_macro: latest.f1_macro || 0,
                f1_weighted: latest.f1_weighted || 0,
              } : undefined,
            });
          }
        }
      } catch {}

    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const startTraining = async () => {
    if (trainingInProgress) return;

    setTrainingInProgress(true);
    try {
      const data = await adminBackendClient.triggerRetraining({
        adminId: 'admin',
        reason: 'Manual training from admin dashboard',
        epochs: epochs,
        outputName: `indicbert_v${Date.now()}`
      }) as any;

      if (data.success && data.jobId) {
        setCurrentJob({
          job_id: data.jobId,
          status: 'queued',
          progress: 0,
          message: 'Training job started'
        });
      } else {
        alert(data.error || 'Failed to start training');
        setTrainingInProgress(false);
      }
    } catch (error: any) {
      console.error('Failed to start training:', error);
      alert(error.message || 'Failed to connect to training server');
      setTrainingInProgress(false);
    }
  };

  const deployModel = async (modelName: string) => {
    setDeployingModel(modelName);
    try {
      const data = await adminBackendClient.deployModel({ modelName }) as any;
      if (data.success) {
        alert(`Model ${modelName} deployed! Restart NLU service to activate.`);
      } else {
        alert(data.error || 'Deployment failed');
      }
    } catch (error: any) {
      console.error('Deployment failed:', error);
      alert(error.message || 'Failed to deploy model');
    } finally {
      setDeployingModel(null);
    }
  };

  const getStatusColor = (status: string | undefined) => {
    if (status === 'ok') return 'text-green-600 bg-green-100';
    if (status === 'running' || status === 'queued') return 'text-blue-600 bg-blue-100';
    if (status === 'completed') return 'text-green-600 bg-green-100';
    if (status === 'failed') return 'text-red-600 bg-red-100';
    return 'text-gray-600 bg-gray-100';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="animate-spin text-green-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#059211] to-[#047a0e] text-white py-12 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Brain size={32} />
                <h1 className="text-4xl font-bold">NLU Training Center</h1>
              </div>
              <p className="text-green-100 text-lg">
                Manage IndicBERT model training and deployment
              </p>
            </div>
            <button
              onClick={fetchStatus}
              className="flex items-center gap-2 px-6 py-2 bg-white text-green-600 rounded-lg hover:bg-green-50 font-semibold transition-colors"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* System Status Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Mercury NLU */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Server className="text-purple-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Mercury NLU</h3>
                  <p className="text-sm text-gray-500">Primary (192.168.0.151)</p>
                </div>
              </div>
              {mercuryHealth ? (
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(mercuryHealth.status)}`}>
                  {mercuryHealth.status.toUpperCase()}
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-sm font-semibold text-red-600 bg-red-100">
                  OFFLINE
                </span>
              )}
            </div>
            {mercuryHealth && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Model:</span>
                  <span className="font-medium">{mercuryHealth.encoder.split('/').pop()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Intents:</span>
                  <span className="font-medium">{mercuryHealth.intent_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Encoder:</span>
                  <span className={mercuryHealth.encoder_loaded ? 'text-green-600' : 'text-red-600'}>
                    {mercuryHealth.encoder_loaded ? '✓ Loaded' : '✗ Not Loaded'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Jupiter NLU */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Server className="text-blue-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Jupiter NLU</h3>
                  <p className="text-sm text-gray-500">Fallback (localhost)</p>
                </div>
              </div>
              {jupiterHealth ? (
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(jupiterHealth.status)}`}>
                  {jupiterHealth.status.toUpperCase()}
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-sm font-semibold text-red-600 bg-red-100">
                  OFFLINE
                </span>
              )}
            </div>
            {jupiterHealth && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Model:</span>
                  <span className="font-medium">{jupiterHealth.encoder.split('/').pop()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Intents:</span>
                  <span className="font-medium">{jupiterHealth.intent_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Encoder:</span>
                  <span className={jupiterHealth.encoder_loaded ? 'text-green-600' : 'text-red-600'}>
                    {jupiterHealth.encoder_loaded ? '✓ Loaded' : '✗ Not Loaded'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Training Server */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Cpu className="text-orange-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Training Server</h3>
                  <p className="text-sm text-gray-500">Port 8082</p>
                </div>
              </div>
              {trainingStatus ? (
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(trainingStatus.status)}`}>
                  {trainingStatus.status.toUpperCase()}
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-sm font-semibold text-red-600 bg-red-100">
                  OFFLINE
                </span>
              )}
            </div>
            {trainingStatus && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">GPU:</span>
                  <span className={trainingStatus.gpu_available ? 'text-green-600' : 'text-red-600'}>
                    {trainingStatus.gpu_available ? '✓ Available' : '✗ Not Available'}
                  </span>
                </div>
                {trainingStatus.gpu_info && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">GPU Name:</span>
                      <span className="font-medium text-xs">{trainingStatus.gpu_info.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">VRAM:</span>
                      <span className="font-medium">{trainingStatus.gpu_info.memory_total}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Jobs:</span>
                  <span className="font-medium">{trainingStatus.active_training_jobs}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Training Control Panel */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Start Training */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-100 rounded-lg">
                <Zap className="text-green-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">Start Training</h3>
                <p className="text-sm text-gray-500">Train new IndicBERT model</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Epochs</label>
                <input
                  type="number"
                  value={epochs}
                  onChange={(e) => setEpochs(parseInt(e.target.value) || 5)}
                  min={1}
                  max={20}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Size</label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 16)}
                  min={4}
                  max={64}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Learning Rate</label>
                <input
                  type="number"
                  value={learningRate}
                  onChange={(e) => setLearningRate(parseFloat(e.target.value) || 0.00003)}
                  step={0.00001}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={startTraining}
              disabled={trainingInProgress || !trainingStatus}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                trainingInProgress || !trainingStatus
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {trainingInProgress ? (
                <>
                  <RefreshCw className="animate-spin" size={20} />
                  Training in Progress...
                </>
              ) : (
                <>
                  <Play size={20} />
                  Start Training
                </>
              )}
            </button>

            {!trainingStatus && (
              <p className="text-sm text-red-600 mt-2 text-center">
                Training server is offline. Start it first.
              </p>
            )}
          </div>

          {/* Current Job Status */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Activity className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">Training Status</h3>
                <p className="text-sm text-gray-500">Current/Last job progress</p>
              </div>
            </div>

            {currentJob ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Job ID:</span>
                  <span className="font-mono text-sm">{currentJob.job_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(currentJob.status)}`}>
                    {currentJob.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Progress:</span>
                    <span className="font-medium">{currentJob.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full transition-all ${
                        currentJob.status === 'failed' ? 'bg-red-500' : 
                        currentJob.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${currentJob.progress}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Message:</strong> {currentJob.message}
                </div>
                {currentJob.results && (
                  <div className="bg-green-50 rounded-lg p-4 mt-4">
                    <h4 className="font-semibold text-green-800 mb-2">Results:</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Accuracy:</span>
                        <p className="font-bold text-green-700">{(currentJob.results.accuracy * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-gray-600">F1 Macro:</span>
                        <p className="font-bold text-green-700">{(currentJob.results.f1_macro * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-gray-600">F1 Weighted:</span>
                        <p className="font-bold text-green-700">{(currentJob.results.f1_weighted * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                )}
                {currentJob.error && (
                  <div className="bg-red-50 rounded-lg p-4 mt-4">
                    <h4 className="font-semibold text-red-800 mb-2">Error:</h4>
                    <p className="text-sm text-red-700">{currentJob.error}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                <p>No training jobs yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Available Models */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <HardDrive className="text-purple-600" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">Available Models</h3>
                <p className="text-sm text-gray-500">Trained models ready for deployment</p>
              </div>
            </div>
          </div>

          {models.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <HardDrive size={48} className="mx-auto mb-4 opacity-50" />
              <p>No models available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Model Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Intents</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Accuracy</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Samples</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Size</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="font-medium">{model.name}</span>
                        {mercuryHealth?.encoder.includes(model.name) && (
                          <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {model.config?.num_labels || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {model.config?.accuracy ? (
                          <span className={`font-semibold ${
                            model.config.accuracy >= 0.7 ? 'text-green-600' :
                            model.config.accuracy >= 0.5 ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            {(model.config.accuracy * 100).toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {model.config?.training_samples || '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {model.size_mb.toFixed(1)} MB
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => deployModel(model.name)}
                          disabled={deployingModel === model.name || mercuryHealth?.encoder.includes(model.name)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                            mercuryHealth?.encoder.includes(model.name)
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : deployingModel === model.name
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {deployingModel === model.name ? (
                            <RefreshCw className="animate-spin" size={14} />
                          ) : (
                            <Rocket size={14} />
                          )}
                          {mercuryHealth?.encoder.includes(model.name) ? 'Active' : 'Deploy'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm text-blue-900 font-medium mb-1">Training Notes</p>
              <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                <li>Training uses <strong>ai4bharat/IndicBERTv2-MLM-Back-TLM</strong> as base model</li>
                <li>Training data is loaded from approved samples in the database</li>
                <li>Mercury NLU currently uses: <strong>{mercuryHealth?.encoder.split('/').pop() || 'Unknown'}</strong></li>
                <li>After deployment, restart the NLU service to load the new model</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
