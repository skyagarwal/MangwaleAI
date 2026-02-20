'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock, Activity, Zap } from 'lucide-react'
import { useToast } from '@/components/shared'

interface HealingStats {
  totalErrors: number
  errorsResolved: number
  repairsAttempted: number
  repairsSuccessful: number
  successRate: number
  avgRepairTime: number
  lastCycleTime: string
}

interface Error {
  id: number
  message: string
  source: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  processed: boolean
  healingAttempted: boolean
}

interface HealingCycle {
  id: number
  startedAt: string
  completedAt: string
  errorsFound: number
  repairsAttempted: number
  repairsSuccessful: number
  status: 'running' | 'completed' | 'failed'
}

const severityColors = {
  low: 'bg-blue-100 text-blue-800 border-blue-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
}

export default function SelfHealingDashboard() {
  const [stats, setStats] = useState<HealingStats | null>(null)
  const [errors, setErrors] = useState<Error[]>([])
  const [cycles, setCycles] = useState<HealingCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'errors' | 'cycles'>('overview')
  const toast = useToast()

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/healing/stats')
      if (res.ok) {
        setStats(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch healing stats:', error)
    }
  }

  const fetchErrors = async () => {
    try {
      const res = await fetch('/api/healing/errors')
      if (res.ok) {
        setErrors(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch errors:', error)
    }
  }

  const fetchCycles = async () => {
    try {
      const res = await fetch('/api/healing/cycles')
      if (res.ok) {
        setCycles(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch cycles:', error)
    }
  }

  const triggerManualHeal = async () => {
    try {
      const res = await fetch('/api/healing/trigger', { method: 'POST' })
      if (res.ok) {
        toast.success('Manual healing cycle triggered')
        await Promise.all([fetchStats(), fetchErrors(), fetchCycles()])
      }
    } catch (error) {
      console.error('Failed to trigger healing:', error)
      toast.error('Failed to trigger healing cycle')
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchStats(), fetchErrors(), fetchCycles()])
      setLoading(false)
    }

    loadData()

    if (autoRefresh) {
      const interval = setInterval(loadData, 30000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Activity className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading healing system status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-7 h-7 text-yellow-500" />
            Self-Healing System
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Monitor and manage automatic error detection and repair</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchStats}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={triggerManualHeal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition"
          >
            <Zap className="w-4 h-4" />
            Trigger Healing Cycle
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-700 transition">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            Auto-Refresh
          </label>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Total Errors</p>
              <div className="bg-red-100 p-2 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.totalErrors}</p>
            <p className="text-gray-500 text-sm mt-1">{stats.errorsResolved} resolved</p>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Success Rate</p>
              <div className="bg-green-100 p-2 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</p>
            <p className="text-gray-500 text-sm mt-1">{stats.repairsSuccessful} successful repairs</p>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Repairs Attempted</p>
              <div className="bg-yellow-100 p-2 rounded-lg">
                <Zap className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.repairsAttempted}</p>
            <p className="text-gray-500 text-sm mt-1">{stats.avgRepairTime.toFixed(1)}s avg time</p>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Last Cycle</p>
              <div className="bg-blue-100 p-2 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-gray-900">{stats.lastCycleTime}</p>
            <p className="text-gray-500 text-sm mt-1">Runs every 5 minutes</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', 'errors', 'cycles'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-600" />
              System Health
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">Resolution Rate</span>
                  <span className="text-sm font-semibold text-gray-900">{((stats.errorsResolved / Math.max(stats.totalErrors, 1)) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(stats.errorsResolved / Math.max(stats.totalErrors, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">Repair Success Rate</span>
                  <span className="text-sm font-semibold text-gray-900">{stats.successRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${stats.successRate}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">📊 <strong>Status:</strong> System is operational</p>
                <p className="text-sm text-gray-600 mb-1">⚙️ <strong>Mode:</strong> Automatic repair enabled</p>
                <p className="text-sm text-gray-600">🔄 <strong>Last run:</strong> {stats.lastCycleTime}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-gray-600" />
              Quick Actions
            </h3>
            <div className="space-y-3">
              <button
                onClick={triggerManualHeal}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold text-sm"
              >
                <Zap className="w-4 h-4" />
                Trigger Healing Cycle Now
              </button>
              <button
                onClick={fetchErrors}
                className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Error List
              </button>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                <p className="font-semibold mb-2">💡 Healing System Info:</p>
                <ul className="space-y-1 text-xs">
                  <li>✅ Automatically detects errors every 5 minutes</li>
                  <li>✅ Uses AI to analyze root causes</li>
                  <li>✅ Auto-repairs safe issues (confidence &gt; 70%)</li>
                  <li>✅ Learns from successful fixes</li>
                  <li>⏳ Monitoring: 1-hour verification period</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === 'errors' && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Errors</h3>
          </div>
          <div className="p-6">
            {errors.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No recent errors detected</p>
                <p className="text-gray-400 text-sm mt-1">Your system is running smoothly! 🎉</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {errors.map((error) => (
                  <div
                    key={error.id}
                    className={`p-4 rounded-lg border-l-4 bg-white border border-gray-200 ${severityColors[error.severity]}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-gray-900">{error.message.substring(0, 60)}...</p>
                        <p className="text-xs mt-1 text-gray-500">{error.source}</p>
                      </div>
                      <div className="flex gap-2">
                        {error.healingAttempted && (
                          <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            <Zap className="w-3 h-3" />
                            Repaired
                          </span>
                        )}
                        {!error.processed && (
                          <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">{new Date(error.timestamp).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cycles Tab */}
      {activeTab === 'cycles' && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Healing Cycles</h3>
          </div>
          <div className="p-6">
            {cycles.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No healing cycles recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Cycle ID</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Started At</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Errors Found</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Repairs</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Success</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cycles.map((cycle) => (
                      <tr key={cycle.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">#{cycle.id}</td>
                        <td className="px-4 py-3 text-gray-700">{new Date(cycle.startedAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{cycle.errorsFound}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{cycle.repairsAttempted}</td>
                        <td className="px-4 py-3 text-center">
                          {cycle.repairsSuccessful > 0 ? (
                            <span className="flex items-center justify-center gap-1 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                              {cycle.repairsSuccessful}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cycle.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
                              <CheckCircle className="w-4 h-4" />
                              Done
                            </span>
                          )}
                          {cycle.status === 'running' && (
                            <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold">
                              <Activity className="w-4 h-4 animate-spin" />
                              Running
                            </span>
                          )}
                          {cycle.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold">
                              <XCircle className="w-4 h-4" />
                              Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500 text-sm">
        <p>Self-Healing System • Auto-refreshing every 30 seconds when enabled</p>
        <p className="mt-1">For more information, check the documentation: <a href="/docs/self-healing" className="text-blue-600 hover:underline">Self-Healing Guide</a></p>
      </div>
    </div>
  )
}
