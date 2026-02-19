'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, CheckCircle, XCircle, Loader2, RefreshCw, Globe, Activity, Target, Zap } from 'lucide-react';
import { adminBackendClient } from '@/lib/api/admin-backend';

interface NluHealthStatus {
  mercury_nlu: {
    status: string;
    url: string;
    error?: string;
    encoder?: string;
    intent_count?: number;
    encoder_loaded?: boolean;
  } | null;
  training_server: {
    status: string;
    url: string;
    error?: string;
  } | null;
}

// Real NLU configuration - 33 canonical intents from IndicBERTv2 model
const CANONICAL_INTENTS = [
  'greeting', 'chitchat', 'order_food', 'parcel_booking', 'search_product',
  'browse_menu', 'browse_category', 'browse_stores',
  'ask_recommendation', 'ask_famous', 'ask_fastest_delivery', 'ask_price', 'ask_time',
  'add_to_cart', 'view_cart', 'remove_from_cart', 'update_quantity',
  'checkout', 'select_item',
  'track_order', 'cancel_order', 'repeat_order', 'manage_address', 'use_saved',
  'affirm', 'deny', 'confirm', 'cancel', 'restart', 'feedback',
  'help', 'complaint', 'login',
];

export default function NLUConfigPage() {
  const [health, setHealth] = useState<NluHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [nluTestResult, setNluTestResult] = useState<any>(null);
  const [testingNlu, setTestingNlu] = useState(false);

  useEffect(() => {
    loadNluHealth();
  }, []);

  const loadNluHealth = async () => {
    setLoading(true);
    try {
      const data = await adminBackendClient.getNluHealth() as any;
      setHealth(data.data || data);
    } catch (error) {
      console.error('Failed to load NLU health:', error);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  const testNluConnection = async () => {
    setTestingNlu(true);
    try {
      const response = await fetch('/api/settings/nlu/test');
      const data = await response.json();
      setNluTestResult(data);
    } catch (error) {
      setNluTestResult({ ok: false, error: 'Connection test failed' });
    } finally {
      setTestingNlu(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const mercuryOnline = health?.mercury_nlu?.status === 'ok' || health?.mercury_nlu?.status === 'healthy';
  const trainingOnline = health?.training_server?.status === 'ok' || health?.training_server?.status === 'healthy';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">NLU Configuration</h1>
          <p className="text-gray-500 mt-1">
            IndicBERTv2 intent classification pipeline
          </p>
        </div>
        <Button onClick={loadNluHealth} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Model Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Model</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">IndicBERTv2</div>
            <p className="text-xs text-gray-500 mt-1">ai4bharat/IndicBERTv2-MLM-only (278M params)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Intents</CardTitle>
            <Target className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{CANONICAL_INTENTS.length}</div>
            <p className="text-xs text-gray-500 mt-1">Canonical intents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confidence Threshold</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.65</div>
            <p className="text-xs text-gray-500 mt-1">Below this triggers LLM fallback</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Training Data</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5,171</div>
            <p className="text-xs text-gray-500 mt-1">v7 samples (deployed 2026-02-16)</p>
          </CardContent>
        </Card>
      </div>

      {/* Service Health */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Mercury NLU Server
              {mercuryOnline ? (
                <Badge className="bg-green-500 ml-2">
                  <CheckCircle className="mr-1 h-3 w-3" /> Online
                </Badge>
              ) : (
                <Badge variant="destructive" className="ml-2">
                  <XCircle className="mr-1 h-3 w-3" /> Offline
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Primary inference server (192.168.0.151:7012)</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.mercury_nlu ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Endpoint:</span>
                  <span className="font-mono">{health.mercury_nlu.url}</span>
                </div>
                {health.mercury_nlu.encoder && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Encoder:</span>
                    <span className="font-medium">{health.mercury_nlu.encoder}</span>
                  </div>
                )}
                {health.mercury_nlu.intent_count && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Intent Count:</span>
                    <span className="font-medium">{health.mercury_nlu.intent_count}</span>
                  </div>
                )}
                {health.mercury_nlu.error && (
                  <div className="text-red-500 text-xs mt-2">{health.mercury_nlu.error}</div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Unable to reach Mercury NLU server</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Training Server
              {trainingOnline ? (
                <Badge className="bg-green-500 ml-2">
                  <CheckCircle className="mr-1 h-3 w-3" /> Online
                </Badge>
              ) : (
                <Badge variant="destructive" className="ml-2">
                  <XCircle className="mr-1 h-3 w-3" /> Offline
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Mercury training server (192.168.0.151:8082)</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.training_server ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Endpoint:</span>
                  <span className="font-mono">{health.training_server.url}</span>
                </div>
                {health.training_server.error && (
                  <div className="text-red-500 text-xs mt-2">{health.training_server.error}</div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Unable to reach training server</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* NLU Connection Test */}
      <Card>
        <CardHeader>
          <CardTitle>NLU Health Check</CardTitle>
          <CardDescription>Test the NLU service connection from the backend</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button onClick={testNluConnection} disabled={testingNlu}>
              {testingNlu ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
              Test NLU Connection
            </Button>
            {nluTestResult && (
              <div className="flex items-center gap-2">
                {nluTestResult.ok ? (
                  <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" /> Connected</Badge>
                ) : (
                  <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>
                )}
                {nluTestResult.error && <span className="text-sm text-red-500">{nluTestResult.error}</span>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Architecture */}
      <Card>
        <CardHeader>
          <CardTitle>Classification Pipeline</CardTitle>
          <CardDescription>Multi-tier intent classification with automatic fallback</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 overflow-x-auto py-4">
            <div className="flex flex-col items-center min-w-[140px] p-4 border-2 border-blue-200 bg-blue-50 rounded-xl">
              <span className="text-xs text-blue-600 font-medium mb-1">Step 1</span>
              <span className="font-semibold text-blue-900">Heuristics</span>
              <span className="text-xs text-blue-700 mt-1">Pattern matching</span>
            </div>
            <span className="text-gray-400 text-2xl">-&gt;</span>
            <div className="flex flex-col items-center min-w-[140px] p-4 border-2 border-purple-200 bg-purple-50 rounded-xl">
              <span className="text-xs text-purple-600 font-medium mb-1">Step 2</span>
              <span className="font-semibold text-purple-900">IndicBERTv2</span>
              <span className="text-xs text-purple-700 mt-1">Mercury:7012</span>
            </div>
            <span className="text-gray-400 text-2xl">-&gt;</span>
            <div className="flex flex-col items-center min-w-[140px] p-4 border-2 border-orange-200 bg-orange-50 rounded-xl">
              <span className="text-xs text-orange-600 font-medium mb-1">Step 3 (fallback)</span>
              <span className="font-semibold text-orange-900">LLM (vLLM/Groq)</span>
              <span className="text-xs text-orange-700 mt-1">Qwen2.5-7B-AWQ</span>
            </div>
            <span className="text-gray-400 text-2xl">-&gt;</span>
            <div className="flex flex-col items-center min-w-[140px] p-4 border-2 border-gray-200 bg-gray-50 rounded-xl">
              <span className="text-xs text-gray-600 font-medium mb-1">Step 4 (final)</span>
              <span className="font-semibold text-gray-900">Heuristics</span>
              <span className="text-xs text-gray-700 mt-1">Keyword fallback</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canonical Intents */}
      <Card>
        <CardHeader>
          <CardTitle>Canonical Intents ({CANONICAL_INTENTS.length})</CardTitle>
          <CardDescription>All intents recognized by the IndicBERTv2 model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CANONICAL_INTENTS.map((intent) => (
              <Badge key={intent} variant="outline" className="text-sm py-1 px-3">
                {intent}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Multilingual Support */}
      <Card>
        <CardHeader>
          <CardTitle>Multilingual Support</CardTitle>
          <CardDescription>Languages supported by IndicBERTv2 model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center space-x-2 p-3 border rounded-lg">
              <Globe className="h-5 w-5 text-blue-500" />
              <div>
                <div className="font-semibold">English (en)</div>
                <div className="text-sm text-gray-500">Primary</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg">
              <Globe className="h-5 w-5 text-orange-500" />
              <div>
                <div className="font-semibold">Hindi (hi)</div>
                <div className="text-sm text-gray-500">Supported</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg">
              <Globe className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-semibold">Marathi (mr)</div>
                <div className="text-sm text-gray-500">Supported</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Model Performance (v7)</CardTitle>
          <CardDescription>Evaluation metrics from the most recent training run</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Accuracy</span>
                <span className="font-semibold">78.74%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '78.74%' }}></div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">F1 Score</span>
                <span className="font-semibold">78.56%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '78.56%' }}></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
