// API Monitoring Utility for Search Testing

export interface APICallRecord {
  id: string;
  timestamp: Date;
  endpoint: string;
  method: string;
  params: Record<string, any>;
  responseTime: number;
  statusCode: number;
  resultCount: number;
  success: boolean;
  rawRequest: any;
  rawResponse: any;
  error?: string;
}

class SearchMonitor {
  private calls: APICallRecord[] = [];
  private maxCalls = 50;
  private listeners: Array<(call: APICallRecord) => void> = [];

  recordCall(call: Omit<APICallRecord, 'id' | 'timestamp'>): void {
    const record: APICallRecord = {
      ...call,
      id: `call-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
    };

    this.calls.unshift(record);
    
    // Limit stored calls
    if (this.calls.length > this.maxCalls) {
      this.calls = this.calls.slice(0, this.maxCalls);
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(record));
  }

  getCalls(): APICallRecord[] {
    return [...this.calls];
  }

  getCall(id: string): APICallRecord | undefined {
    return this.calls.find(call => call.id === id);
  }

  clearCalls(): void {
    this.calls = [];
    this.listeners.forEach(listener => listener({} as APICallRecord));
  }

  subscribe(callback: (call: APICallRecord) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Generate curl command from API call
  generateCurl(call: APICallRecord): string {
    const { endpoint, method, params, rawRequest } = call;
    
    if (method === 'GET') {
      const queryParams = new URLSearchParams(params).toString();
      return `curl -X GET "${endpoint}?${queryParams}"`;
    } else {
      return `curl -X ${method} "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(rawRequest, null, 2)}'`;
    }
  }

  // Generate Postman collection
  generatePostmanCollection(): any {
    return {
      info: {
        name: 'Mangwale Search API - Recorded Calls',
        description: 'Auto-generated from search testing session',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: this.calls.map(call => ({
        name: `${call.method} ${call.endpoint}`,
        request: {
          method: call.method,
          header: [
            {
              key: 'Content-Type',
              value: 'application/json',
            },
          ],
          url: {
            raw: call.endpoint,
            protocol: 'http',
            host: ['localhost'],
            port: '3100',
            path: call.endpoint.replace('http://localhost:3100/', '').split('/'),
            query: Object.entries(call.params).map(([key, value]) => ({
              key,
              value: String(value),
            })),
          },
          body: call.method !== 'GET' ? {
            mode: 'raw',
            raw: JSON.stringify(call.rawRequest, null, 2),
          } : undefined,
        },
        response: [],
      })),
    };
  }

  // Get statistics
  getStats() {
    const totalCalls = this.calls.length;
    const successfulCalls = this.calls.filter(c => c.success).length;
    const failedCalls = totalCalls - successfulCalls;
    const avgResponseTime = totalCalls > 0
      ? this.calls.reduce((sum, c) => sum + c.responseTime, 0) / totalCalls
      : 0;

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0,
      avgResponseTime: Math.round(avgResponseTime),
    };
  }
}

export const searchMonitor = new SearchMonitor();
