'use client';

import { useState, useEffect } from 'react';
import { 
  Search, Terminal, Play, Copy, Download, X, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Database, TrendingUp, Store, Package,
  Image as ImageIcon, MapPin, Star, Calendar, DollarSign, Tag
} from 'lucide-react';
import { searchAPIClient } from '@/lib/api/search-api';
import { searchMonitor, APICallRecord } from '@/lib/api/search-monitor';

interface SearchResult {
  id: string;
  name: string;
  description?: string;
  price?: number;
  veg?: number;
  avg_rating?: number;
  image_url?: string;
  store_name?: string;
  distance_km?: number;
  categories?: string[];
  variations?: any[];
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: string;
  query: string;
  module: 'food' | 'ecom' | 'rooms' | 'movies' | 'services';
  filters?: Record<string, any>;
  expectedResults?: number;
  status?: 'pending' | 'running' | 'passed' | 'failed';
}

const TEST_SCENARIOS: TestScenario[] = [
  // Basic Search Tests
  {
    id: 'basic-1',
    name: 'Simple Item Search',
    description: 'Search for "paneer" items',
    category: 'Basic Search',
    query: 'paneer',
    module: 'food',
    expectedResults: 5,
  },
  {
    id: 'basic-2',
    name: 'Multi-word Query',
    description: 'Search for "paneer tikka masala"',
    category: 'Basic Search',
    query: 'paneer tikka masala',
    module: 'food',
  },
  {
    id: 'basic-3',
    name: 'Veg Filter',
    description: 'Search vegetarian items only',
    category: 'Basic Search',
    query: 'curry',
    module: 'food',
    filters: { veg: 1 },
  },
  {
    id: 'basic-4',
    name: 'Price Range',
    description: 'Items between ₹100-300',
    category: 'Basic Search',
    query: 'pizza',
    module: 'food',
    filters: { price_min: 100, price_max: 300 },
  },
  {
    id: 'basic-5',
    name: 'Rating Filter',
    description: 'Items with 4+ rating',
    category: 'Basic Search',
    query: 'biryani',
    module: 'food',
    filters: { rating_min: 4.0 },
  },

  // Store Search Tests
  {
    id: 'store-1',
    name: 'Search Stores',
    description: 'Find stores with "dhaba" in name',
    category: 'Store Features',
    query: 'dhaba',
    module: 'food',
  },
  {
    id: 'store-2',
    name: 'Store Ratings',
    description: 'Stores with high ratings',
    category: 'Store Features',
    query: 'restaurant',
    module: 'food',
    filters: { rating_min: 4.5 },
  },

  // Advanced Features
  {
    id: 'advanced-1',
    name: 'Category Filter',
    description: 'Search within specific category',
    category: 'Advanced Features',
    query: 'snacks',
    module: 'food',
    filters: { category_id: 1 },
  },
  {
    id: 'advanced-2',
    name: 'Geolocation Search',
    description: 'Nearby items (Nashik coordinates)',
    category: 'Advanced Features',
    query: 'food',
    module: 'food',
    filters: { lat: 19.9975, lon: 73.7898, radius_km: 5 },
  },
];

export default function SearchTestingPage() {
  const [activeTab, setActiveTab] = useState<'test' | 'analytics' | 'console'>('test');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModule, setSelectedModule] = useState<'food' | 'ecom'>('food');
  
  // Developer Console
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [apiCalls, setApiCalls] = useState<APICallRecord[]>([]);
  const [selectedCall, setSelectedCall] = useState<APICallRecord | null>(null);
  
  // Quick Tests
  const [testScenarios, setTestScenarios] = useState<TestScenario[]>(TEST_SCENARIOS);
  const [runningTests, setRunningTests] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalItems: 1500,
    totalStores: 139,
    totalCategories: 151,
    totalImages: 13967,
    avgResponseTime: 245,
    successRate: 96.5,
  });

  useEffect(() => {
    // Subscribe to API monitor
    const unsubscribe = searchMonitor.subscribe((call) => {
      if (call.id) {
        setApiCalls(searchMonitor.getCalls());
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    const startTime = Date.now();
    
    try {
      const response = await searchAPIClient.search(query, {
        module: selectedModule,
        filters: {},
        page: 1,
        limit: 20,
      });

      // Record the call
      searchMonitor.recordCall({
        endpoint: `${searchAPIClient['baseUrl']}/search/${selectedModule}`,
        method: 'GET',
        params: { q: query },
        responseTime: Date.now() - startTime,
        statusCode: 200,
        resultCount: response.items?.length || 0,
        success: true,
        rawRequest: { query, module: selectedModule },
        rawResponse: response,
      });

      setResults(response.items || []);
    } catch (error: any) {
      searchMonitor.recordCall({
        endpoint: `${searchAPIClient['baseUrl']}/search/${selectedModule}`,
        method: 'GET',
        params: { q: query },
        responseTime: Date.now() - startTime,
        statusCode: 500,
        resultCount: 0,
        success: false,
        rawRequest: { query, module: selectedModule },
        rawResponse: null,
        error: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const runTest = async (test: TestScenario) => {
    // Update test status
    setTestScenarios(prev => prev.map(t => 
      t.id === test.id ? { ...t, status: 'running' } : t
    ));

    const startTime = Date.now();
    try {
      const response = await searchAPIClient.search(test.query, {
        module: test.module,
        filters: test.filters || {},
        page: 1,
        limit: 20,
      });

      const passed = test.expectedResults 
        ? (response.items?.length ?? 0) >= test.expectedResults
        : (response.items?.length ?? 0) > 0;

      searchMonitor.recordCall({
        endpoint: `${searchAPIClient['baseUrl']}/search/${test.module}`,
        method: 'GET',
        params: { q: test.query, ...test.filters },
        responseTime: Date.now() - startTime,
        statusCode: 200,
        resultCount: response.items?.length || 0,
        success: true,
        rawRequest: { query: test.query, module: test.module, filters: test.filters },
        rawResponse: response,
      });

      setTestScenarios(prev => prev.map(t => 
        t.id === test.id ? { ...t, status: passed ? 'passed' : 'failed' } : t
      ));
    } catch (error: any) {
      searchMonitor.recordCall({
        endpoint: `${searchAPIClient['baseUrl']}/search/${test.module}`,
        method: 'GET',
        params: { q: test.query, ...test.filters },
        responseTime: Date.now() - startTime,
        statusCode: 500,
        resultCount: 0,
        success: false,
        rawRequest: { query: test.query, module: test.module },
        rawResponse: null,
        error: error.message,
      });

      setTestScenarios(prev => prev.map(t => 
        t.id === test.id ? { ...t, status: 'failed' } : t
      ));
    }
  };

  const runAllTests = async () => {
    setRunningTests(true);
    for (const test of testScenarios) {
      await runTest(test);
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay between tests
    }
    setRunningTests(false);
  };

  const copyCurl = (call: APICallRecord) => {
    const curl = searchMonitor.generateCurl(call);
    navigator.clipboard.writeText(curl);
  };

  const exportPostman = () => {
    const collection = searchMonitor.generatePostmanCollection();
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mangwale-search-api.postman_collection.json';
    a.click();
  };

  const clearConsole = () => {
    searchMonitor.clearCalls();
    setApiCalls([]);
    setSelectedCall(null);
  };

  // Group tests by category
  const testCategories = Array.from(new Set(testScenarios.map(t => t.category)));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Search size={32} />
          <h1 className="text-3xl font-bold">Search Testing & Monitoring</h1>
        </div>
        <p className="text-blue-100">
          Comprehensive testing interface with API monitoring and developer tools
        </p>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 max-w-7xl mx-auto">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalItems.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Items</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalStores}</div>
            <div className="text-sm text-gray-600">Stores</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalCategories}</div>
            <div className="text-sm text-gray-600">Categories</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalImages.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Images</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.avgResponseTime}ms</div>
            <div className="text-sm text-gray-600">Avg Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.successRate}%</div>
            <div className="text-sm text-gray-600">Success</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('test')}
              className={`px-6 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'test'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              🔍 Manual Testing
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-6 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              ⚡ Quick Tests
            </button>
            <button
              onClick={() => setActiveTab('console')}
              className={`px-6 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'console'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              🛠️ API Console ({apiCalls.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Manual Testing Tab */}
        {activeTab === 'test' && (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex gap-4 mb-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedModule('food')}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      selectedModule === 'food'
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    🍕 Food
                  </button>
                  <button
                    onClick={() => setSelectedModule('ecom')}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      selectedModule === 'ecom'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    🛍️ Ecom
                  </button>
                </div>

                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search for items..."
                    className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Results ({results.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <h4 className="font-bold text-gray-900 mb-2">{item.name}</h4>
                      {item.price && (
                        <div className="text-green-600 font-bold mb-2">₹{item.price}</div>
                      )}
                      {item.store_name && (
                        <div className="text-sm text-gray-600 mb-2">🏪 {item.store_name}</div>
                      )}
                      {item.avg_rating && (
                        <div className="text-sm text-gray-600">⭐ {item.avg_rating.toFixed(1)}</div>
                      )}
                      {item.veg !== undefined && (
                        <div className="mt-2">
                          <span className={`text-xs px-2 py-1 rounded ${item.veg ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {item.veg ? '🌱 Veg' : '🍖 Non-Veg'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Tests Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">Automated Test Scenarios</h3>
                <button
                  onClick={runAllTests}
                  disabled={runningTests}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center gap-2"
                >
                  <Play size={16} />
                  {runningTests ? 'Running Tests...' : 'Run All Tests'}
                </button>
              </div>

              {testCategories.map((category) => (
                <div key={category} className="mb-6">
                  <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    {category}
                    <span className="text-sm text-gray-500">
                      ({testScenarios.filter(t => t.category === category).length} tests)
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {testScenarios.filter(t => t.category === category).map((test) => (
                      <div
                        key={test.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{test.name}</div>
                          <div className="text-sm text-gray-600">{test.description}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Query: "{test.query}" | Module: {test.module}
                            {test.filters && ` | Filters: ${Object.keys(test.filters).length}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {test.status === 'passed' && <CheckCircle2 className="text-green-600" size={20} />}
                          {test.status === 'failed' && <XCircle className="text-red-600" size={20} />}
                          {test.status === 'running' && (
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                          )}
                          <button
                            onClick={() => runTest(test)}
                            disabled={runningTests}
                            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm font-medium"
                          >
                            Run
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Console Tab */}
        {activeTab === 'console' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Terminal size={20} />
                    API Call History ({apiCalls.length})
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={exportPostman}
                      className="px-4 py-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 font-medium flex items-center gap-2"
                    >
                      <Download size={16} />
                      Export Postman
                    </button>
                    <button
                      onClick={clearConsole}
                      className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium flex items-center gap-2"
                    >
                      <X size={16} />
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {apiCalls.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <Terminal className="mx-auto mb-4 text-gray-400" size={48} />
                    <p>No API calls yet. Run some searches to see them here.</p>
                  </div>
                ) : (
                  apiCalls.map((call) => (
                    <div key={call.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${call.success ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="font-mono text-sm font-medium text-gray-700">{call.method}</span>
                          <span className="font-mono text-sm text-gray-600">{call.endpoint}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>{call.responseTime}ms</span>
                          <span>{call.resultCount} results</span>
                          <span className="text-xs text-gray-500">
                            {new Date(call.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm text-gray-600 mb-2">
                        {Object.entries(call.params).map(([key, value]) => (
                          <span key={key} className="inline-block mr-3">
                            <span className="font-medium">{key}=</span>
                            <span className="font-mono">{String(value)}</span>
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => copyCurl(call)}
                          className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          📋 Copy curl
                        </button>
                        <button
                          onClick={() => setSelectedCall(selectedCall?.id === call.id ? null : call)}
                          className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          {selectedCall?.id === call.id ? 'Hide' : 'Show'} Details
                        </button>
                      </div>

                      {selectedCall?.id === call.id && (
                        <div className="mt-4 space-y-2">
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Request:</div>
                            <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto">
                              {JSON.stringify(call.rawRequest, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Response:</div>
                            <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-64 overflow-y-auto">
                              {JSON.stringify(call.rawResponse, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
