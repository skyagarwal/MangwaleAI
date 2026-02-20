'use client';

import { useState, useEffect } from 'react';
import {
  Phone, PhoneCall, PhoneOutgoing,
  Users, Store, Bike, RefreshCw, CheckCircle, XCircle,
  Activity, Zap,
  Volume2, Radio, Settings, History,
  BarChart3
} from 'lucide-react';
import { useToast } from '@/components/shared';

interface NerveHealth {
  status: string;
  service: string;
  active_calls: number;
  tts_cache_size: number;
  components: {
    tts_cache: boolean;
    exotel_client: boolean;
    jupiter_reporter: boolean;
  };
}

interface VoiceCall {
  id: string;
  call_type: 'VENDOR_ORDER_CONFIRMATION' | 'RIDER_ASSIGNMENT' | 'RIDER_PICKUP_READY' | 'CUSTOMER_NOTIFICATION';
  status: 'INITIATED' | 'RINGING' | 'ANSWERED' | 'COMPLETED' | 'FAILED' | 'NO_ANSWER' | 'BUSY';
  order_id: number;
  recipient_name: string;
  phone_number: string;
  duration_seconds?: number;
  dtmf_digits?: string;
  prep_time_minutes?: number;
  created_at: string;
  completed_at?: string;
}

interface CallStats {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  avg_duration: number;
  vendor_acceptance_rate: number;
  rider_acceptance_rate: number;
}

export default function NervePage() {
  const [health, setHealth] = useState<NerveHealth | null>(null);
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'calls' | 'test' | 'settings'>('overview');

  // Test call state
  const [testOrderId, setTestOrderId] = useState('12345');
  const [testVendorPhone, setTestVendorPhone] = useState('');
  const [testVendorName, setTestVendorName] = useState('Test Vendor');
  const [testAmount, setTestAmount] = useState('450');
  const [initiatingCall, setInitiatingCall] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);
  const toast = useToast();

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    await Promise.all([loadHealth(), loadCalls(), loadStats()]);
    setLoading(false);
  };

  const loadHealth = async () => {
    try {
      const response = await fetch('/api/exotel/nerve/health');
      if (response.ok) {
        const data = await response.json();
        setHealth(data);
      }
    } catch (error) {
      console.error('Failed to load Nerve health:', error);
    }
  };

  const loadCalls = async () => {
    try {
      const response = await fetch('/api/exotel/nerve/calls?limit=50');
      if (response.ok) {
        const data = await response.json();
        setCalls(data.calls || []);
      }
    } catch (error) {
      console.error('Failed to load calls:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/exotel/nerve/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      setStats({
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        avg_duration: 0,
        vendor_acceptance_rate: 0,
        rider_acceptance_rate: 0,
      });
    }
  };

  const initiateTestCall = async (type: 'vendor' | 'rider') => {
    if (!testVendorPhone) {
      toast.error('Please enter a phone number');
      return;
    }

    setInitiatingCall(true);
    setCallResult(null);

    try {
      const endpoint = type === 'vendor'
        ? '/api/exotel/nerve/vendor/confirm'
        : '/api/exotel/nerve/rider/assign';

      const body = type === 'vendor' ? {
        orderId: parseInt(testOrderId),
        vendorId: 1,
        vendorPhone: testVendorPhone,
        vendorName: testVendorName,
        orderAmount: parseFloat(testAmount),
        itemCount: 3,
        language: 'hi'
      } : {
        orderId: parseInt(testOrderId),
        riderId: 1,
        riderPhone: testVendorPhone,
        riderName: testVendorName,
        vendorName: 'Test Restaurant',
        vendorAddress: 'Near Main Market',
        estimatedAmount: 35,
        language: 'hi'
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      setCallResult(data);

      if (data.status === 'initiated') {
        toast.success(`Call initiated! Call ID: ${data.callId}`);
      } else {
        toast.error(`Call failed: ${data.message}`);
      }
    } catch (error: any) {
      setCallResult({ error: error.message });
      toast.error('Error initiating call: ' + error.message);
    } finally {
      setInitiatingCall(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-600';
      case 'ANSWERED': return 'text-blue-600';
      case 'RINGING': return 'text-yellow-600';
      case 'INITIATED': return 'text-gray-500';
      case 'FAILED': case 'NO_ANSWER': case 'BUSY': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getCallTypeIcon = (type: string) => {
    switch (type) {
      case 'VENDOR_ORDER_CONFIRMATION': return <Store className="w-4 h-4" />;
      case 'RIDER_ASSIGNMENT': return <Bike className="w-4 h-4" />;
      case 'RIDER_PICKUP_READY': return <PhoneOutgoing className="w-4 h-4" />;
      case 'CUSTOMER_NOTIFICATION': return <Users className="w-4 h-4" />;
      default: return <Phone className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" />
            Nerve AI Voice System
          </h1>
          <p className="text-gray-500 mt-1">
            Automated AI voice calls for vendors and riders
          </p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">System Status</span>
            {health?.status === 'healthy' ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          <p className={`text-xl font-bold mt-2 ${health?.status === 'healthy' ? 'text-green-600' : 'text-red-600'}`}>
            {health?.status || 'Unknown'}
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Active Calls</span>
            <PhoneCall className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-xl font-bold mt-2 text-gray-900">
            {health?.active_calls || 0}
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">TTS Cache</span>
            <Volume2 className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-xl font-bold mt-2 text-gray-900">
            {health?.tts_cache_size || 0} phrases
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Components</span>
            <Activity className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex gap-2 mt-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${health?.components?.tts_cache ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              TTS
            </span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${health?.components?.exotel_client ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              Exotel
            </span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${health?.components?.jupiter_reporter ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              Jupiter
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', 'calls', 'test', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition -mb-px border-b-2 ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Stats */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-400" />
              Call Statistics
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Total Calls</span>
                <span className="text-gray-900 font-semibold">{stats?.total_calls || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Successful</span>
                <span className="text-green-600 font-semibold">{stats?.successful_calls || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Failed</span>
                <span className="text-red-600 font-semibold">{stats?.failed_calls || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Avg Duration</span>
                <span className="text-gray-900 font-semibold">{stats?.avg_duration || 0}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Vendor Accept Rate</span>
                <span className="text-blue-600 font-semibold">{(stats?.vendor_acceptance_rate || 0) * 100}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Rider Accept Rate</span>
                <span className="text-purple-600 font-semibold">{(stats?.rider_acceptance_rate || 0) * 100}%</span>
              </div>
            </div>
          </div>

          {/* Call Flow */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Radio className="w-5 h-5 text-gray-400" />
              AI Call Flow
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <Store className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-gray-900 font-medium">Vendor Confirmation</p>
                  <p className="text-gray-500 text-xs">AI calls vendor → Press 1 to accept → Set prep time</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <Bike className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-gray-900 font-medium">Rider Assignment</p>
                  <p className="text-gray-500 text-xs">AI calls rider → Press 1 to accept → Navigate to vendor</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
                <PhoneOutgoing className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-gray-900 font-medium">Pickup Ready</p>
                  <p className="text-gray-500 text-xs">Notify rider → Order is ready for pickup</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <Users className="w-5 h-5 text-purple-500 flex-shrink-0" />
                <div>
                  <p className="text-gray-900 font-medium">Customer Update</p>
                  <p className="text-gray-500 text-xs">Notify customer → Order status updates</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calls' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" />
              Recent Calls
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">DTMF</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No calls recorded yet
                    </td>
                  </tr>
                ) : (
                  calls.map((call) => (
                    <tr key={call.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-gray-600">
                          {getCallTypeIcon(call.call_type)}
                          <span className="text-xs">
                            {call.call_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-gray-900 text-sm font-medium">{call.recipient_name}</p>
                          <p className="text-gray-500 text-xs">{call.phone_number}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900 text-sm">#{call.order_id}</td>
                      <td className="px-4 py-3">
                        <span className={`${getStatusColor(call.status)} text-sm font-medium`}>
                          {call.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {call.duration_seconds ? `${call.duration_seconds}s` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {call.dtmf_digits || '-'}
                        {call.prep_time_minutes && (
                          <span className="text-xs text-blue-600 ml-1">
                            ({call.prep_time_minutes}min)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(call.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'test' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Store className="w-5 h-5 text-orange-500" />
              Test Vendor Confirmation Call
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
                <input
                  type="text"
                  value={testOrderId}
                  onChange={(e) => setTestOrderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="12345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Phone</label>
                <input
                  type="text"
                  value={testVendorPhone}
                  onChange={(e) => setTestVendorPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="919876543210"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={testVendorName}
                  onChange={(e) => setTestVendorName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Test Vendor"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Amount (₹)</label>
                <input
                  type="text"
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="450"
                />
              </div>
              <button
                onClick={() => initiateTestCall('vendor')}
                disabled={initiatingCall}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white rounded-lg transition font-medium"
              >
                {initiatingCall ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Phone className="w-4 h-4" />
                )}
                Call Vendor
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Bike className="w-5 h-5 text-blue-500" />
              Test Rider Assignment Call
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
                <input
                  type="text"
                  value={testOrderId}
                  onChange={(e) => setTestOrderId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="12345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rider Phone</label>
                <input
                  type="text"
                  value={testVendorPhone}
                  onChange={(e) => setTestVendorPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="919876543210"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rider Name</label>
                <input
                  type="text"
                  value={testVendorName}
                  onChange={(e) => setTestVendorName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Test Rider"
                />
              </div>
              <button
                onClick={() => initiateTestCall('rider')}
                disabled={initiatingCall}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition font-medium mt-[72px]"
              >
                {initiatingCall ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Phone className="w-4 h-4" />
                )}
                Call Rider
              </button>
            </div>
          </div>

          {callResult && (
            <div className="md:col-span-2 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Call Result</h3>
              <pre className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-sm text-gray-700 overflow-auto">
                {JSON.stringify(callResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            Nerve System Settings
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-500 text-sm">Nerve System URL</p>
                <p className="text-gray-900 font-mono text-sm mt-1">http://localhost:7100</p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-500 text-sm">TTS Provider</p>
                <p className="text-gray-900 text-sm mt-1">Chatterbox (Hindi) + Kokoro (English)</p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-500 text-sm">Telephony Provider</p>
                <p className="text-gray-900 text-sm mt-1">Exotel</p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-500 text-sm">Default Language</p>
                <p className="text-gray-900 text-sm mt-1">Hindi (hi)</p>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-gray-500 text-sm mb-3">Call Flow Configuration</p>
              <div className="space-y-2 text-sm divide-y divide-gray-200">
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Vendor Accept Timeout</span>
                  <span className="text-gray-900 font-medium">30 seconds</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Max Retry Attempts</span>
                  <span className="text-gray-900 font-medium">3</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Escalation to Admin</span>
                  <span className="text-gray-900 font-medium">After 2 failed attempts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
