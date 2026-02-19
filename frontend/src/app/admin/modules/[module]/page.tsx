'use client';

import { use, useEffect, useState } from 'react';
import { Brain, Settings, TrendingUp, Activity, Users, Zap, Loader2, AlertCircle } from 'lucide-react';
import { mangwaleAIClient } from '@/lib/api/mangwale-ai';
import { InfoTooltip } from '@/components/shared/InfoTooltip';

const moduleConfigs = {
  food: {
    name: 'Food Ordering',
    icon: '🍔',
    color: 'from-orange-600 to-orange-700',
    description: 'Manage food ordering agent and restaurant search',
    intents: ['order_food', 'search_restaurant', 'modify_order', 'track_order'],
  },
  ecom: {
    name: 'E-commerce',
    icon: '🛒',
    color: 'from-blue-600 to-blue-700',
    description: 'Manage e-commerce agent and product search',
    intents: ['search_product', 'add_to_cart', 'checkout', 'track_order'],
  },
  parcel: {
    name: 'Parcel Delivery',
    icon: '📦',
    color: 'from-purple-600 to-purple-700',
    description: 'Manage parcel booking and tracking agent',
    intents: ['book_parcel', 'track_parcel', 'modify_booking', 'cancel_booking'],
  },
  ride: {
    name: 'Ride Hailing',
    icon: '🚗',
    color: 'from-green-600 to-green-700',
    description: 'Manage ride booking and tracking agent',
    intents: ['book_ride', 'track_ride', 'cancel_ride', 'rate_driver'],
  },
  health: {
    name: 'Healthcare',
    icon: '❤️',
    color: 'from-red-600 to-red-700',
    description: 'Manage healthcare services agent',
    intents: ['book_doctor', 'book_lab', 'order_medicine', 'track_prescription'],
  },
  rooms: {
    name: 'Hotel Booking',
    icon: '🏨',
    color: 'from-indigo-600 to-indigo-700',
    description: 'Manage hotel and room booking agent',
    intents: ['search_hotel', 'book_room', 'modify_booking', 'cancel_booking'],
  },
  movies: {
    name: 'Movie Tickets',
    icon: '🎬',
    color: 'from-pink-600 to-pink-700',
    description: 'Manage movie ticket booking agent',
    intents: ['search_movie', 'book_ticket', 'select_seats', 'cancel_booking'],
  },
  services: {
    name: 'Home Services',
    icon: '🔧',
    color: 'from-yellow-600 to-yellow-700',
    description: 'Manage home services booking agent',
    intents: ['book_service', 'track_service', 'rate_provider', 'reschedule'],
  }
};

interface ModuleStats {
  totalConversations: number;
  conversationsToday: number;
  completedOrders: number;
  successRate: number;
  averageSatisfaction: number;
  activeFlows: number;
  totalFlows: number;
  supportedIntents: string[];
}

export default function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = use(params);
  const config = moduleConfigs[module as keyof typeof moduleConfigs];
  const [stats, setStats] = useState<ModuleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModuleStats();
  }, [module]);

  const loadModuleStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await mangwaleAIClient.getModuleStats(module);
      setStats(data);
    } catch (err) {
      console.error('Failed to load module stats:', err);
      setError('Failed to load module statistics');
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Module Not Found</h1>
        <p className="text-gray-600">The module &ldquo;{module}&rdquo; does not exist.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading module statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`bg-gradient-to-r ${config.color} rounded-2xl p-8 text-white shadow-lg`}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">{config.icon}</span>
          <h1 className="text-3xl font-bold">{config.name} Agent</h1>
        </div>
        <p className="text-white/90">{config.description}</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Users className="text-blue-600" size={24} />
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-500">Conversations</span>
              <InfoTooltip content="Total number of conversations handled by this module agent." />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats?.totalConversations.toLocaleString() || 0}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {stats?.conversationsToday || 0} today
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Activity className="text-green-600" size={24} />
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-500">Completions</span>
              <InfoTooltip content="Successfully completed orders/bookings through this agent." />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats?.completedOrders.toLocaleString() || 0}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {stats?.successRate.toFixed(1) || 0}% success rate
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="text-purple-600" size={24} />
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-500">Satisfaction</span>
              <InfoTooltip content="Average customer satisfaction rating from post-conversation surveys." />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats?.averageSatisfaction.toFixed(1) || 0} / 5.0
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Brain className="text-indigo-600" size={24} />
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-500">Flows</span>
              <InfoTooltip content="Number of conversation flows configured for this module." />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats?.activeFlows || 0} / {stats?.totalFlows || 0}
          </div>
          <p className="text-sm text-gray-600 mt-1">Active flows</p>
        </div>
      </div>

      {/* Agent Configuration */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Settings size={20} />
          Agent Configuration
        </h2>
        <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-500">
          <Settings size={32} className="mx-auto mb-3 text-gray-400" />
          <p className="font-medium text-gray-700 mb-1">Per-module agent configuration is not yet available.</p>
          <p className="text-sm">
            Use the <a href="/admin/agent-settings" className="text-blue-600 hover:underline">Agent Settings</a> page to configure global NLU and LLM settings.
          </p>
        </div>
      </div>

      {/* Intents */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={20} />
          <h2 className="text-lg font-semibold text-gray-900">Supported Intents</h2>
          <InfoTooltip content="User intents that this agent can understand and respond to. Each intent represents a specific user goal (e.g., order_food, track_order)." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {stats?.supportedIntents.map(intent => (
            <div key={intent} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-900">{intent}</span>
              <Zap size={16} className="text-yellow-600" />
            </div>
          )) || config.intents.map(intent => (
            <div key={intent} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-900">{intent}</span>
              <Zap size={16} className="text-yellow-600" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
