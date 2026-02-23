// API Monitor Service - Tracks all API calls for developer console

export type APICall = {
  id: string
  timestamp: number
  method: string
  url: string
  params: Record<string, any>
  status: 'pending' | 'success' | 'error'
  duration?: number
  response?: any
  error?: string
  statusCode?: number
}

type Listener = (calls: APICall[]) => void

class APIMonitor {
  private calls: APICall[] = []
  private listeners: Listener[] = []
  private maxCalls = 100

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener)
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notify(): void {
    this.listeners.forEach(listener => {
      try {
        listener([...this.calls])
      } catch (error) {
        console.error('Error notifying listener:', error)
      }
    })
  }

  startCall(method: string, url: string, params: Record<string, any> = {}): string {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const call: APICall = {
      id,
      timestamp: Date.now(),
      method: method.toUpperCase(),
      url,
      params,
      status: 'pending'
    }
    
    this.calls.unshift(call)
    
    // Keep only the last N calls
    if (this.calls.length > this.maxCalls) {
      this.calls = this.calls.slice(0, this.maxCalls)
    }
    
    this.notify()
    return id
  }

  endCall(
    id: string, 
    success: boolean, 
    response?: any, 
    error?: string,
    statusCode?: number
  ): void {
    const call = this.calls.find(c => c.id === id)
    if (!call) return

    call.status = success ? 'success' : 'error'
    call.duration = Date.now() - call.timestamp
    call.statusCode = statusCode
    
    if (response) {
      call.response = response
    }
    
    if (error) {
      call.error = error
    }
    
    this.notify()
  }

  getCalls(): APICall[] {
    return [...this.calls]
  }

  getCall(id: string): APICall | undefined {
    return this.calls.find(c => c.id === id)
  }

  clear(): void {
    this.calls = []
    this.notify()
  }

  // Get statistics
  getStats() {
    const total = this.calls.length
    const success = this.calls.filter(c => c.status === 'success').length
    const error = this.calls.filter(c => c.status === 'error').length
    const pending = this.calls.filter(c => c.status === 'pending').length
    
    const completedCalls = this.calls.filter(c => c.duration !== undefined)
    const avgLatency = completedCalls.length > 0
      ? Math.round(completedCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / completedCalls.length)
      : 0
    
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0'
    
    return {
      total,
      success,
      error,
      pending,
      avgLatency,
      successRate: parseFloat(successRate)
    }
  }
}

// Singleton instance
export const apiMonitor = new APIMonitor()

// Export for convenience
export default apiMonitor
