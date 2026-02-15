'use client';

import { useState, useEffect } from 'react';
import {
  Tag,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Brain,
} from 'lucide-react';

interface EntityType {
  type: string;
  description: string;
  examples: string[];
  priority: number;
  requiresResolution: boolean;
  patternCount: number;
}

interface NerHealth {
  ok: boolean;
  modelLoaded?: boolean;
  entityTypes?: number;
  error?: string;
}

interface TestResult {
  text: string;
  entities: Array<{
    entity: string;
    value: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
}

// Entity types defined in backend (mirrored for display)
const ENTITY_TYPES: EntityType[] = [
  { type: 'food_reference', description: 'Any food/dish mention', examples: ['pizza', 'biryani', 'paneer tikka', 'butter chicken', 'momos'], priority: 100, requiresResolution: true, patternCount: 0 },
  { type: 'store_reference', description: 'Restaurant/store name or description', examples: ['dominos', 'that chinese place', 'nearby dhaba', 'hotel taj'], priority: 100, requiresResolution: true, patternCount: 0 },
  { type: 'location_reference', description: 'Location mention - address, landmark', examples: ['nashik', 'home', 'office', 'cbs circle', 'near college road'], priority: 100, requiresResolution: true, patternCount: 0 },
  { type: 'quantity', description: 'Numeric quantity or amount', examples: ['2', '5', 'one', 'do', 'teen'], priority: 95, requiresResolution: false, patternCount: 1 },
  { type: 'cooking_instructions', description: 'Cooking preferences and instructions', examples: ['well done', 'medium spicy', 'extra cheese', 'less oil', 'no onion'], priority: 90, requiresResolution: false, patternCount: 3 },
  { type: 'delivery_time_slot', description: 'Specific delivery time window or urgency', examples: ['between 7-8pm', 'by 6pm', 'in 30 minutes', 'asap', 'abhi jaldi'], priority: 90, requiresResolution: false, patternCount: 5 },
  { type: 'dietary_restrictions', description: 'Dietary preferences and restrictions', examples: ['veg', 'non-veg', 'jain', 'gluten-free', 'no egg', 'halal'], priority: 90, requiresResolution: false, patternCount: 4 },
  { type: 'quantity_unit', description: 'Quantity with unit specification', examples: ['dozen', 'half plate', 'full plate', 'large', 'medium', 'small'], priority: 90, requiresResolution: false, patternCount: 4 },
  { type: 'multi_store_coordination', description: 'References to multiple stores in single order', examples: ['from dominos and kfc', 'pizza from X and burger from Y'], priority: 85, requiresResolution: true, patternCount: 2 },
  { type: 'address_components', description: 'Structured address components', examples: ['flat 201', 'building B', 'near CBS circle', '2nd floor'], priority: 85, requiresResolution: false, patternCount: 5 },
  { type: 'time_reference', description: 'General time expressions', examples: ['now', 'later', 'evening', 'night', 'abhi', 'baad mein'], priority: 80, requiresResolution: false, patternCount: 2 },
  { type: 'preference', description: 'User preferences (spice level, cooking style)', examples: ['spicy', 'mild', 'fried', 'grilled', 'teekha'], priority: 80, requiresResolution: false, patternCount: 0 },
  { type: 'price_reference', description: 'Budget or price mentions', examples: ['under 500', 'cheap', 'sasta', '200 rupees'], priority: 75, requiresResolution: false, patternCount: 3 },
  { type: 'person_reference', description: 'Person names or references', examples: ['Rahul', 'my friend', 'for mom', 'mere liye'], priority: 70, requiresResolution: false, patternCount: 2 },
  { type: 'order_reference', description: 'Reference to previous orders', examples: ['last order', 'previous order', 'order #123', 'pichla order'], priority: 70, requiresResolution: true, patternCount: 3 },
  { type: 'phone', description: 'Phone numbers', examples: ['9876543210', '+91 9876543210'], priority: 60, requiresResolution: false, patternCount: 2 },
  { type: 'email', description: 'Email addresses', examples: ['user@example.com'], priority: 60, requiresResolution: false, patternCount: 1 },
];

const PRIORITY_COLORS: Record<string, string> = {
  '100': 'bg-red-900/30 text-red-300 border-red-700',
  '95': 'bg-orange-900/30 text-orange-300 border-orange-700',
  '90': 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
  '85': 'bg-blue-900/30 text-blue-300 border-blue-700',
  '80': 'bg-purple-900/30 text-purple-300 border-purple-700',
  '75': 'bg-cyan-900/30 text-cyan-300 border-cyan-700',
  '70': 'bg-green-900/30 text-green-300 border-green-700',
  '60': 'bg-gray-800/50 text-gray-300 border-gray-600',
};

export default function NerEntitiesPage() {
  const [nerHealth, setNerHealth] = useState<NerHealth | null>(null);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkNerHealth();
  }, []);

  const checkNerHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/learning/ner/health');
      const data = await response.json();
      setNerHealth(data);
    } catch {
      setNerHealth({ ok: false, error: 'Failed to reach NER service' });
    } finally {
      setLoading(false);
    }
  };

  const testNerExtraction = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/admin/learning/ner/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });
      const data = await response.json();
      setTestResult(data);
    } catch {
      setTestResult({ text: testText, entities: [] });
    } finally {
      setTesting(false);
    }
  };

  const filteredTypes = ENTITY_TYPES.filter(
    (et) =>
      !searchFilter ||
      et.type.toLowerCase().includes(searchFilter.toLowerCase()) ||
      et.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      et.examples.some((ex) => ex.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  const getPriorityColor = (priority: number) => {
    return PRIORITY_COLORS[String(priority)] || PRIORITY_COLORS['60'];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">NER Entity Management</h1>
          <p className="text-gray-400 mt-1">
            {ENTITY_TYPES.length} entity types configured for Named Entity Recognition
          </p>
        </div>
        <button
          onClick={checkNerHealth}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* NER Service Health */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">NER Service Status</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking NER service...
          </div>
        ) : nerHealth?.ok ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Online</span>
            </div>
            {nerHealth.entityTypes && (
              <span className="text-gray-400">
                {nerHealth.entityTypes} entity types in model
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-5 h-5" />
            <span className="font-medium">Offline</span>
            <span className="text-gray-500 text-sm ml-2">{nerHealth?.error}</span>
          </div>
        )}
      </div>

      {/* Live NER Testing */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold text-white">Test Entity Extraction</h2>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testNerExtraction()}
            placeholder="Type a message to test NER extraction... e.g. 'I want 2 paneer pizzas from dominos under 500'"
            className="flex-1 bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
          />
          <button
            onClick={testNerExtraction}
            disabled={testing || !testText.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Extract
          </button>
        </div>

        {testResult && (
          <div className="mt-4 bg-gray-900 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">
              Input: <span className="text-white">{testResult.text}</span>
            </div>
            {testResult.entities.length === 0 ? (
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                No entities extracted
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {testResult.entities.map((entity, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-900/20 border border-blue-700"
                  >
                    <Tag className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-300 text-sm font-medium">{entity.entity}</span>
                    <span className="text-white text-sm">{entity.value}</span>
                    {entity.confidence !== undefined && (
                      <span className="text-gray-500 text-xs">
                        ({(entity.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entity Types List */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tag className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">Entity Types</h2>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter entity types..."
                className="bg-gray-900 border border-gray-600 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-700">
          {filteredTypes.map((et) => (
            <div key={et.type}>
              <button
                onClick={() => setExpandedType(expandedType === et.type ? null : et.type)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-750 transition-colors text-left"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span
                    className={`px-2.5 py-1 text-xs rounded-full border font-medium ${getPriorityColor(et.priority)}`}
                  >
                    P{et.priority}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-sm">{et.type}</span>
                      {et.requiresResolution && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-900/30 text-purple-300 border border-purple-700">
                          RESOLVES
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm truncate">{et.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-gray-500 text-xs">{et.examples.length} examples</span>
                  {et.patternCount > 0 && (
                    <span className="text-gray-500 text-xs">{et.patternCount} patterns</span>
                  )}
                  {expandedType === et.type ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </button>

              {expandedType === et.type && (
                <div className="px-6 pb-4 bg-gray-850">
                  <div className="ml-[88px]">
                    <div className="mb-3">
                      <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                        Examples
                      </span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {et.examples.map((ex, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-gray-900 text-gray-300 rounded-lg text-sm border border-gray-700"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-3">
                      <span>Priority: {et.priority}</span>
                      <span>Requires Resolution: {et.requiresResolution ? 'Yes' : 'No'}</span>
                      {et.patternCount > 0 && <span>Regex Patterns: {et.patternCount}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-white">{ENTITY_TYPES.length}</div>
          <div className="text-gray-400 text-sm mt-1">Total Entity Types</div>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {ENTITY_TYPES.filter((e) => e.requiresResolution).length}
          </div>
          <div className="text-gray-400 text-sm mt-1">Require Resolution</div>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {ENTITY_TYPES.filter((e) => e.patternCount > 0).length}
          </div>
          <div className="text-gray-400 text-sm mt-1">With Regex Patterns</div>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-center">
          <div className="text-2xl font-bold text-green-400">
            {ENTITY_TYPES.reduce((sum, e) => sum + e.examples.length, 0)}
          </div>
          <div className="text-gray-400 text-sm mt-1">Total Examples</div>
        </div>
      </div>
    </div>
  );
}
