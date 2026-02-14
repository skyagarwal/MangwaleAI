'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock, Activity, Zap } from 'lucide-react'

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
        alert('✅ Manual healing cycle triggered')
        await Promise.all([fetchStats(), fetchErrors(), fetchCycles()])
      }
    } catch (error) {
      console.error('Failed to trigger healing:', error)
      alert('❌ Failed to trigger healing cycle')
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
      const interval = setInterval(loadData, 30000) // Refresh every 30s
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <Activity className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading healing system status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Zap className="w-10 h-10 text-yellow-400" />
              Self-Healing System Dashboard
            </h1>
            <p className="text-slate-400 mt-2">Monitor and manage automatic error detection and repair</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchStats}
              className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={triggerManualHeal}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <Zap className="w-4 h-4" />
              Trigger Healing Cycle
            </button>
            <label className="flex items-center gap-2 bg-slate-700 px-4 py-2 rounded-lg cursor-pointer hover:bg-slate-600 transition">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-300">Total Errors</h3>
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-3xl font-bold">{stats.totalErrors}</p>
              <p className="text-slate-400 text-sm mt-2">{stats.errorsResolved} resolved</p>
            </div>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-300">Success Rate</h3>
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-3xl font-bold">{stats.successRate.toFixed(1)}%</p>
              <p className="text-slate-400 text-sm mt-2">{stats.repairsSuccessful} successful repairs</p>
            </div>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-300">Repairs Attempted</h3>
                <Zap className="w-6 h-6 text-yellow-400" />
              </div>
              <p className="text-3xl font-bold">{stats.repairsAttempted}</p>
              <p className="text-slate-400 text-sm mt-2">{stats.avgRepairTime.toFixed(1)}s avg time</p>
            </div>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-300">Last Cycle</h3>
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-lg font-bold">{stats.lastCycleTime}</p>
              <p className="text-slate-400 text-sm mt-2">Runs every 5 minutes</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-slate-600">
          {(['overview', 'errors', 'cycles'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-semibold transition ${
                activeTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                System Health
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">Resolution Rate</span>
                    <span className="font-semibold">{((stats.errorsResolved / Math.max(stats.totalErrors, 1)) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${(stats.errorsResolved / Math.max(stats.totalErrors, 1)) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-300">Repair Success Rate</span>
                    <span className="font-semibold">{stats.successRate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${stats.successRate}%` }}
                    ></div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-slate-600 rounded-lg">
                  <p className="text-sm text-slate-300 mb-2">📊 <strong>Status:</strong> System is operational</p>
                  <p className="text-sm text-slate-300">⚙️ <strong>Mode:</strong> Automatic repair enabled</p>
                  <p className="text-sm text-slate-300">🔄 <strong>Last run:</strong> {stats.lastCycleTime}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Quick Actions
              </h3>
              <div className="space-y-3">
                <button
                  onClick={triggerManualHeal}
                  className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold"
                >
                  <Zap className="w-4 h-4" />
                  Trigger Healing Cycle Now
                </button>
                <button
                  onClick={fetchErrors}
                  className="w-full bg-slate-600 hover:bg-slate-500 px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Error List
                </button>
                <div className="p-3 bg-slate-600 rounded-lg text-sm text-slate-300">
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
          <div className="bg-slate-700 border border-slate-600 rounded-lg overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">Recent Errors</h3>
              {errors.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-slate-300">No recent errors detected</p>
                  <p className="text-slate-400 text-sm">Your system is running smoothly! 🎉</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {errors.map((error) => (
                    <div
                      key={error.id}
                      className={`p-4 rounded-lg border-l-4 ${severityColors[error.severity]} bg-slate-600`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-semibold">{error.message.substring(0, 60)}...</p>
                          <p className="text-xs mt-1 opacity-75">{error.source}</p>
                        </div>
                        <div className="flex gap-2">
                          {error.healingAttempted && (
                            <span className="flex items-center gap-1 text-xs bg-slate-700 px-2 py-1 rounded">
                              <Zap className="w-3 h-3" />
                              Repaired
                            </span>
                          )}
                          {!error.processed && (
                            <span className="flex items-center gap-1 text-xs bg-slate-700 px-2 py-1 rounded">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs opacity-60">{new Date(error.timestamp).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cycles Tab */}
        {activeTab === 'cycles' && (
          <div className="bg-slate-700 border border-slate-600 rounded-lg overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">Healing Cycles</h3>
              {cycles.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-300">No healing cycles recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left px-4 py-3 font-semibold">Cycle ID</th>
                        <th className="text-left px-4 py-3 font-semibold">Started At</th>
                        <th className="text-center px-4 py-3 font-semibold">Errors Found</th>
                        <th className="text-center px-4 py-3 font-semibold">Repairs</th>
                        <th className="text-center px-4 py-3 font-semibold">Success</th>
                        <th className="text-center px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map((cycle) => (
                        <tr key={cycle.id} className="border-b border-slate-600 hover:bg-slate-600 transition">
                          <td className="px-4 py-3 font-mono text-xs">#{cycle.id}</td>
                          <td className="px-4 py-3">{new Date(cycle.startedAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">{cycle.errorsFound}</td>
                          <td className="px-4 py-3 text-center">{cycle.repairsAttempted}</td>
                          <td className="px-4 py-3 text-center flex justify-center">
                            {cycle.repairsSuccessful > 0 ? (
                              <span className="flex items-center gap-1 text-green-400">
                                <CheckCircle className="w-4 h-4" />
                                {cycle.repairsSuccessful}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {cycle.status === 'completed' && (
                              <span className="inline-flex items-center gap-1 text-green-400 text-xs font-semibold">
                                <CheckCircle className="w-4 h-4" />
                                Done
                              </span>
                            )}
                            {cycle.status === 'running' && (
                              <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-semibold">
                                <Activity className="w-4 h-4 animate-spin" />
                                Running
                              </span>
                            )}
                            {cycle.status === 'failed' && (
                              <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
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
        <div className="mt-8 p-4 bg-slate-700 border border-slate-600 rounded-lg text-center text-slate-400 text-sm">
          <p>Self-Healing System • Auto-refreshing every 30 seconds when enabled</p>
          <p className="mt-1">For more information, check the documentation: <a href="/docs/self-healing" className="text-blue-400 hover:underline">Self-Healing Guide</a></p>
        </div>
      </div>
    </div>
  )
}
