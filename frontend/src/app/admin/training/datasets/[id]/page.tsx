'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Edit, Trash2, Download, Upload, Database } from 'lucide-react';
import TrainingConfigModal, {
  TrainingConfig,
} from '@/components/TrainingConfigModal';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface TrainingExample {
  id: string;
  text: string;
  intent: string;
  entities: Array<{ type: string; value: string }>;
  confidence?: number;
}

interface DatasetInfo {
  id: string;
  name: string;
  type: string;
  module: string;
  exampleCount: number;
}

export default function DatasetDetailPage({ params }: { params: { id: string } }) {
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDataset();
  }, [params.id]);

  const loadDataset = async () => {
    setLoading(true);
    setError('');
    try {
      const [dsData, examplesData] = await Promise.all([
        adminBackendClient.getDataset(params.id),
        adminBackendClient.getDatasetExamples(params.id),
      ]);
      setDataset(dsData as unknown as DatasetInfo);
      setExamples((examplesData || []) as unknown as TrainingExample[]);
    } catch (err) {
      console.error('Failed to load dataset:', err);
      setError('Failed to load dataset. The training API may be unavailable.');
      setDataset(null);
      setExamples([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTraining = (config: TrainingConfig) => {
    console.log('Starting training with config:', config);
    adminBackendClient.startTrainingJob({
      datasetId: params.id,
      epochs: config.epochs,
      batchSize: config.batchSize,
      learningRate: config.learningRate,
    }).then(() => {
      alert('Training job started successfully!');
    }).catch((err) => {
      console.error('Failed to start training:', err);
      alert('Failed to start training job. Please try again.');
    });
  };

  const [filter, setFilter] = useState('all');
  const intents = Array.from(new Set(examples.map((e) => e.intent)));

  const filteredExamples =
    filter === 'all' ? examples : examples.filter((e) => e.intent === filter);

  const datasetName = dataset?.name || `Dataset ${params.id}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-2">Loading...</div>
          <div className="text-gray-600">Fetching dataset details...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-yellow-800">
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <Link
          href="/admin/training"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-[#059211] mb-4"
        >
          <ArrowLeft size={20} />
          Back to Training
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {datasetName}
            </h1>
            <p className="text-gray-600 mt-1">
              {examples.length} training examples{dataset?.type ? ` • ${dataset.type.toUpperCase()}` : ''}{dataset?.module ? ` • ${dataset.module} module` : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-lg hover:border-[#059211] transition-all">
              <Upload size={20} />
              Import
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 rounded-lg hover:border-[#059211] transition-all">
              <Download size={20} />
              Export
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#059211] to-[#047a0e] text-white rounded-lg hover:shadow-lg transition-all">
              <Plus size={20} />
              Add Example
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-md border-2 border-gray-100">
          <div className="text-2xl font-bold text-gray-900">
            {examples.length}
          </div>
          <div className="text-sm text-gray-600">Total Examples</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-md border-2 border-gray-100">
          <div className="text-2xl font-bold text-gray-900">
            {intents.length}
          </div>
          <div className="text-sm text-gray-600">Unique Intents</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-md border-2 border-gray-100">
          <div className="text-2xl font-bold text-gray-900">
            {examples.length > 0
              ? (
                  examples.reduce((sum, e) => sum + (e.confidence || 0), 0) /
                  examples.length
                ).toFixed(2)
              : '--'}
          </div>
          <div className="text-sm text-gray-600">Avg Confidence</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-md border-2 border-gray-100">
          <div className="text-2xl font-bold text-gray-900">
            {examples.reduce((sum, e) => sum + (e.entities?.length || 0), 0)}
          </div>
          <div className="text-sm text-gray-600">Total Entities</div>
        </div>
      </div>

      {/* Empty State */}
      {examples.length === 0 && !error && (
        <div className="bg-white rounded-xl p-12 shadow-md border-2 border-gray-100 text-center">
          <Database size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Training Examples</h3>
          <p className="text-gray-600 mb-6">
            This dataset has no training examples yet. Add examples manually or import from a file.
          </p>
          <button className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#059211] to-[#047a0e] text-white rounded-lg hover:shadow-lg transition-all font-medium">
            <Plus size={20} />
            Add First Example
          </button>
        </div>
      )}

      {/* Filters */}
      {examples.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
              filter === 'all'
                ? 'bg-[#059211] text-white'
                : 'bg-white border-2 border-gray-200 hover:border-[#059211]'
            }`}
          >
            All ({examples.length})
          </button>
          {intents.map((intent) => (
            <button
              key={intent}
              onClick={() => setFilter(intent)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                filter === intent
                  ? 'bg-[#059211] text-white'
                  : 'bg-white border-2 border-gray-200 hover:border-[#059211]'
              }`}
            >
              {intent} ({examples.filter((e) => e.intent === intent).length})
            </button>
          ))}
        </div>
      )}

      {/* Examples List */}
      <div className="space-y-3">
        {filteredExamples.map((example) => (
          <div
            key={example.id}
            className="bg-white rounded-xl p-4 shadow-md border-2 border-gray-100 hover:border-[#059211] transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-lg text-gray-900">&quot;{example.text}&quot;</p>
                  {example.confidence && (
                    <span className="text-xs text-gray-500">
                      {(example.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600">Intent:</span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">
                    {example.intent}
                  </span>
                </div>
                {example.entities && example.entities.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-gray-600">Entities:</span>
                    <div className="flex flex-wrap gap-2">
                      {example.entities.map((entity, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm"
                        >
                          {entity.type}: <strong>{entity.value}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Edit size={18} className="text-gray-600" />
                </button>
                <button className="p-2 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={18} className="text-red-600" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div className="flex gap-3 pt-6 border-t border-gray-200">
        <Link
          href="/admin/training"
          className="flex-1 px-6 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-center font-medium"
        >
          Cancel
        </Link>
        <button
          onClick={() => setIsTrainingModalOpen(true)}
          disabled={examples.length === 0}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-[#059211] to-[#047a0e] text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Training with this Dataset
        </button>
      </div>

      {/* Training Config Modal */}
      <TrainingConfigModal
        isOpen={isTrainingModalOpen}
        onClose={() => setIsTrainingModalOpen(false)}
        onSubmit={handleStartTraining}
        datasetId={params.id}
        datasetName={datasetName}
      />
    </div>
  );
}
