'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp, BarChart3, PieChart, Activity, RefreshCw,
  Brain, Target, Zap, AlertTriangle, CheckCircle
} from 'lucide-react';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface IntentStat {
  intent: string;
  count: number;
  avgConfidence: number;
  llmFallbackRate: number;
  sources: {
    conversation: number;
    manual: number;
    game: number;
  };
}

interface IntentAnalytics {
  totalClassifications: number;
  uniqueIntents: number;
  avgConfidence: number;
  llmFallbackRate: number;
  topIntents: IntentStat[];
  lowConfidenceIntents: IntentStat[];
  trainingDataStats: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    byIntent: { intent: string; count: number }[];
  };
}

export default function IntentAnalyticsPage() {
  const [analytics, setAnalytics] = useState<IntentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch learning stats and intents from the backend via adminBackendClient
      const [statsRes, intentsRes] = await Promise.allSettled([
        adminBackendClient.getLearningStats(),
        adminBackendClient.getLearningIntents(),
      ]);

      const stats = statsRes.status === 'fulfilled' ? (statsRes.value as any)?.data || statsRes.value : null;
      const intentsRaw = intentsRes.status === 'fulfilled' ? (intentsRes.value as any)?.data || intentsRes.value : [];

      // Build intent distribution from real data
      const intentDistribution: { intent: string; count: number }[] = Array.isArray(intentsRaw)
        ? intentsRaw.map((i: any) => ({ intent: i.intent || i.name || i, count: Number(i.count) || 0 }))
            .sort((a: any, b: any) => b.count - a.count)
        : [];

      const totalSamples = stats?.totalExamples || intentDistribution.reduce((s: number, i: any) => s + i.count, 0);

      setAnalytics({
        totalClassifications: totalSamples,
        uniqueIntents: intentDistribution.length || 33,
        avgConfidence: stats?.avgConfidence || 0,
        llmFallbackRate: 0, // Not tracked in current stats
        topIntents: intentDistribution.slice(0, 15).map(i => ({
          intent: i.intent,
          count: i.count,
          avgConfidence: stats?.avgConfidence || 0,
          llmFallbackRate: 0,
          sources: { conversation: 0, manual: 0, game: 0 }
        })),
        lowConfidenceIntents: [],
        trainingDataStats: {
          total: totalSamples,
          approved: stats?.autoApproved + stats?.humanApproved || 0,
          pending: stats?.pendingReview || 0,
          rejected: stats?.rejected || 0,
          byIntent: intentDistribution
        }
      });
    } catch (err) {
      console.error('Failed to load analytics:', err);
      // Show empty state instead of fabricated data
      setAnalytics({
        totalClassifications: 0,
        uniqueIntents: 0,
        avgConfidence: 0,
        llmFallbackRate: 0,
        topIntents: [],
        lowConfidenceIntents: [],
        trainingDataStats: {
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          byIntent: []
        }
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto text-green-600 mb-4" size={48} />
          <p className="text-gray-600">Loading intent analytics...</p>
        </div>
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
                <h1 className="text-4xl font-bold">Intent Analytics</h1>
              </div>
              <p className="text-green-100 text-lg">
                Monitor NLU classification performance and training data quality
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2 bg-white/10 rounded-lg p-1">
                {(['7d', '30d', '90d'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      dateRange === range
                        ? 'bg-white text-green-600'
                        : 'text-white hover:bg-white/20'
                    }`}
                  >
                    {range === '7d' && '7 Days'}
                    {range === '30d' && '30 Days'}
                    {range === '90d' && '90 Days'}
                  </button>
                ))}
              </div>
              <button
                onClick={loadAnalytics}
                className="flex items-center gap-2 px-4 py-2 bg-white text-green-600 rounded-lg hover:bg-green-50 font-semibold transition-colors"
              >
                <RefreshCw size={18} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Activity className="text-blue-600" size={24} />
              </div>
              <span className="text-sm text-gray-600">Total Classifications</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {analytics?.totalClassifications.toLocaleString()}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Target className="text-purple-600" size={24} />
              </div>
              <span className="text-sm text-gray-600">Unique Intents</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {analytics?.uniqueIntents}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="text-green-600" size={24} />
              </div>
              <span className="text-sm text-gray-600">Avg Confidence</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {((analytics?.avgConfidence || 0) * 100).toFixed(1)}%
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Zap className="text-orange-600" size={24} />
              </div>
              <span className="text-sm text-gray-600">LLM Fallback Rate</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {((analytics?.llmFallbackRate || 0) * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Training Data Stats */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="text-blue-600" size={20} />
              Training Data Overview
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{analytics?.trainingDataStats.total}</p>
                <p className="text-sm text-gray-600">Total</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{analytics?.trainingDataStats.approved}</p>
                <p className="text-sm text-gray-600">Approved</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{analytics?.trainingDataStats.pending}</p>
                <p className="text-sm text-gray-600">Pending</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{analytics?.trainingDataStats.rejected}</p>
                <p className="text-sm text-gray-600">Rejected</p>
              </div>
            </div>
          </div>

          {/* Confidence Distribution */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <PieChart className="text-purple-600" size={20} />
              Confidence Distribution
            </h2>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Confidence distribution data is not currently tracked per-classification.
                The confidence threshold is set at 0.65 -- classifications below this trigger LLM fallback.
              </p>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-600 font-medium">Confidence Threshold</span>
                  <span className="text-gray-600 font-mono">0.65</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: '65%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-blue-600 font-medium">Model Accuracy (v7)</span>
                  <span className="text-gray-600 font-mono">78.74%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '78.74%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-purple-600 font-medium">Model F1 (v7)</span>
                  <span className="text-gray-600 font-mono">78.56%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: '78.56%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Intent Distribution Table */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="text-green-600" size={20} />
            Training Data by Intent
          </h2>
          
          {analytics?.trainingDataStats.byIntent && analytics.trainingDataStats.byIntent.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Intent</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Samples</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Coverage</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.trainingDataStats.byIntent.map((item, idx) => {
                    const maxCount = Math.max(...analytics.trainingDataStats.byIntent.map(i => i.count));
                    const percentage = (item.count / maxCount) * 100;
                    const isLow = item.count < 50;
                    
                    return (
                      <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900">{item.intent}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono text-gray-700">{item.count}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="w-48">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${isLow ? 'bg-orange-500' : 'bg-green-500'}`}
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isLow ? (
                            <span className="flex items-center justify-center gap-1 text-orange-600">
                              <AlertTriangle size={16} />
                              <span className="text-xs font-medium">Needs more data</span>
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-green-600">
                              <CheckCircle size={16} />
                              <span className="text-xs font-medium">Good coverage</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Brain size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No intent data available. Run some classifications to see analytics.</p>
            </div>
          )}
        </div>

        {/* Low Confidence Alerts */}
        {analytics?.lowConfidenceIntents && analytics.lowConfidenceIntents.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border-2 border-orange-200 p-6 mt-6">
            <h2 className="text-lg font-bold text-orange-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="text-orange-600" size={20} />
              Low Confidence Alerts
            </h2>
            <p className="text-sm text-orange-700 mb-4">
              These intents frequently fall below the confidence threshold and trigger LLM fallback.
              Consider adding more training data.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {analytics.lowConfidenceIntents.map((intent, idx) => (
                <div key={idx} className="p-4 bg-orange-50 rounded-lg">
                  <p className="font-medium text-orange-900">{intent.intent}</p>
                  <p className="text-sm text-orange-700">
                    Avg confidence: {(intent.avgConfidence * 100).toFixed(1)}%
                  </p>
                  <p className="text-sm text-orange-700">
                    LLM fallback: {(intent.llmFallbackRate * 100).toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
