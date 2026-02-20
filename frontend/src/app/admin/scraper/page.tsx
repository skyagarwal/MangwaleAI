'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/shared';
import { 
  Globe, 
  RefreshCw, 
  Play,
  CheckCircle2, 
  Clock, 
  Search,
  TrendingUp,
  TrendingDown,
  Link2,
  Zap,
  Database,
  ArrowUpRight,
  Filter,
  Download
} from 'lucide-react';
import JobDetailsModal from '../../../components/admin/JobDetailsModal';

interface ScraperStats {
  todayJobs: number;
  completed: number;
  failed: number;
  pending: number;
  avgDuration: number;
  storesMapped: number;
  avgConfidence: number;
  scraperServiceStatus: 'online' | 'offline';
  lastSync: string | null;
}

interface ScraperJob {
  id: string;
  source: 'zomato' | 'swiggy';
  storeName: string;
  storeId?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  error?: string;
  itemsScraped?: number;
  reviewsScraped?: number;
}

interface StoreMapping {
  storeId: number;
  storeName: string;
  storeAddress: string;
  zomatoId?: string;
  zomatoUrl?: string;
  zomatoRating?: number;
  swiggyId?: string;
  swiggyUrl?: string;
  swiggyRating?: number;
  matchConfidence: number;
  matchMethod: 'fssai_match' | 'gst_match' | 'name_similarity';
  lastScraped?: string;
}

interface PricingComparison {
  itemName: string;
  ourPrice: number;
  zomatoPrice?: number;
  swiggyPrice?: number;
  zomatoDiff?: number;
  swiggyDiff?: number;
  lastUpdated: string;
}

export default function ScraperDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <ScraperDashboard />
    </Suspense>
  );
}

function ScraperDashboard() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as 'overview' | 'jobs' | 'mappings' | 'pricing' | null;
  
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [jobs, setJobs] = useState<ScraperJob[]>([]);
  const [mappings, setMappings] = useState<StoreMapping[]>([]);
  const [pricing, setPricing] = useState<PricingComparison[]>([]);
  
  // New Scrape Modal
  const [showNewScrapeModal, setShowNewScrapeModal] = useState(false);
  const [newScrapeForm, setNewScrapeForm] = useState({
    source: 'zomato' as 'zomato' | 'swiggy',
    storeName: '',
    storeAddress: 'Nashik',
    url: '',
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'mappings' | 'pricing'>(tabParam || 'overview');
  const [jobFilter, setJobFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [mappingFilter, setMappingFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [matchStoreForm, setMatchStoreForm] = useState({
    storeId: 0,
    storeName: '',
    storeAddress: '',
    fssaiNumber: '',
    gstNumber: '',
    showModal: false,
  });

  // Update tab when URL param changes
  useEffect(() => {
    if (tabParam && ['overview', 'jobs', 'mappings', 'pricing'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, jobsRes, mappingsRes, pricingRes] = await Promise.allSettled([
        fetch('/api/admin/scraper/stats').then(r => r.json()),
        fetch(`/api/admin/scraper/jobs?status=${jobFilter}`).then(r => r.json()),
        fetch(`/api/admin/scraper/mappings?mapped=${mappingFilter === 'all' ? '' : mappingFilter === 'mapped'}`).then(r => r.json()),
        fetch('/api/admin/scraper/pricing').then(r => r.json()),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (jobsRes.status === 'fulfilled') setJobs(jobsRes.value.jobs || []);
      if (mappingsRes.status === 'fulfilled') setMappings(mappingsRes.value.mappings || []);
      if (pricingRes.status === 'fulfilled') setPricing(pricingRes.value.pricing || []);
    } catch (error) {
      console.error('Failed to load scraper data:', error);
    } finally {
      setLoading(false);
    }
  }, [jobFilter, mappingFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const startScrapeJob = async (source: 'zomato' | 'swiggy', storeName: string, storeId?: number, url?: string, storeAddress?: string) => {
    try {
      const response = await fetch('/api/admin/scraper/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, storeName, storeId, url, storeAddress }),
      });
      
      if (response.ok) {
        loadData();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to start scrape job:', error);
      return false;
    }
  };

  const handleNewScrapeSubmit = async () => {
    if (!newScrapeForm.storeName && !newScrapeForm.url) {
      toast.error('Please provide store name or URL');
      return;
    }
    
    const success = await startScrapeJob(
      newScrapeForm.source,
      newScrapeForm.storeName,
      undefined,
      newScrapeForm.url,
      newScrapeForm.storeAddress
    );
    
    if (success) {
      setShowNewScrapeModal(false);
      setNewScrapeForm({ source: 'zomato', storeName: '', storeAddress: 'Nashik', url: '' });
      setActiveTab('jobs');
    }
  };

  const matchStore = async (storeId: number, storeName: string, storeAddress: string) => {
    // Open modal to capture FSSAI/GST for 100% confidence matching
    setMatchStoreForm({
      storeId,
      storeName,
      storeAddress,
      fssaiNumber: '',
      gstNumber: '',
      showModal: true,
    });
  };

  const submitMatchStore = async () => {
    try {
      const response = await fetch('/api/admin/scraper/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: matchStoreForm.storeId,
          storeName: matchStoreForm.storeName,
          storeAddress: matchStoreForm.storeAddress,
          fssaiNumber: matchStoreForm.fssaiNumber || null,
          gstNumber: matchStoreForm.gstNumber || null,
        }),
      });
      if (response.ok) {
        setMatchStoreForm({ ...matchStoreForm, showModal: false });
        loadData();
      }
    } catch (error) {
      console.error('Failed to match store:', error);
    }
  };

  // Export functions for Excel/CSV
  const exportToCSV = (data: Array<Record<string, string | number | boolean | null | undefined>>, filename: string) => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          // Handle values with commas or quotes
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val ?? '';
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportPricingReport = () => {
    const exportData = pricing.map(p => ({
      item_name: p.itemName,
      our_price: p.ourPrice,
      zomato_price: p.zomatoPrice ?? '',
      swiggy_price: p.swiggyPrice ?? '',
      zomato_diff_pct: p.zomatoDiff ? `${p.zomatoDiff > 0 ? '+' : ''}${p.zomatoDiff.toFixed(1)}%` : '',
      swiggy_diff_pct: p.swiggyDiff ? `${p.swiggyDiff > 0 ? '+' : ''}${p.swiggyDiff.toFixed(1)}%` : '',
      last_updated: p.lastUpdated,
    }));
    exportToCSV(exportData, 'pricing_comparison');
  };

  const exportMappingsReport = () => {
    const exportData = mappings.map(m => ({
      store_id: m.storeId,
      store_name: m.storeName,
      store_address: m.storeAddress,
      zomato_id: m.zomatoId ?? '',
      zomato_url: m.zomatoUrl ?? '',
      zomato_rating: m.zomatoRating ?? '',
      swiggy_id: m.swiggyId ?? '',
      swiggy_url: m.swiggyUrl ?? '',
      swiggy_rating: m.swiggyRating ?? '',
      match_confidence: `${(m.matchConfidence * 100).toFixed(0)}%`,
      match_method: m.matchMethod,
      last_scraped: m.lastScraped ?? '',
    }));
    exportToCSV(exportData, 'store_mappings');
  };

  const exportJobsReport = () => {
    const exportData = jobs.map(j => ({
      job_id: j.id,
      source: j.source,
      store_name: j.storeName,
      store_id: j.storeId ?? '',
      status: j.status,
      created_at: j.createdAt,
      completed_at: j.completedAt ?? '',
      items_scraped: j.itemsScraped ?? 0,
      reviews_scraped: j.reviewsScraped ?? 0,
      error: j.error ?? '',
    }));
    exportToCSV(exportData, 'scraper_jobs');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'processing': return 'bg-blue-100 text-blue-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getMatchMethodBadge = (method: string) => {
    switch (method) {
      case 'fssai_match': return 'bg-green-100 text-green-700 border-green-200';
      case 'gst_match': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'name_similarity': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="animate-spin text-[#059211]" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="text-[#059211]" />
            Competitor Scraper Dashboard
          </h1>
          <p className="text-gray-600 mt-1">Monitor Zomato & Swiggy data collection for competitive intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            stats?.scraperServiceStatus === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${stats?.scraperServiceStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
            Scraper {stats?.scraperServiceStatus || 'offline'}
          </div>
          <button
            onClick={() => setShowNewScrapeModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Play size={18} />
            New Scrape
          </button>
          <button 
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#059211] text-white rounded-lg hover:bg-[#047a0e] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">Today&apos;s Jobs</span>
            <Zap className="text-yellow-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.todayJobs || 0}</div>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-green-600">{stats?.completed || 0} done</span>
            <span className="text-yellow-600">{stats?.pending || 0} pending</span>
            <span className="text-red-600">{stats?.failed || 0} failed</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">Stores Mapped</span>
            <Link2 className="text-blue-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.storesMapped || 0}</div>
          <div className="text-sm text-gray-500 mt-2">
            Linked to Zomato/Swiggy
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">Match Confidence</span>
            <CheckCircle2 className="text-green-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {((stats?.avgConfidence || 0) * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Average match accuracy
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">Avg Duration</span>
            <Clock className="text-purple-500" size={20} />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {stats?.avgDuration ? `${(stats.avgDuration / 1000).toFixed(1)}s` : 'N/A'}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Per scrape job
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {['overview', 'jobs', 'mappings', 'pricing'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                activeTab === tab
                  ? 'border-[#059211] text-[#059211]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Jobs */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock size={18} />
              Recent Scrape Jobs
            </h3>
            <div className="space-y-3">
              {jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      job.source === 'zomato' ? 'bg-red-100' : 'bg-orange-100'
                    }`}>
                      {job.source === 'zomato' ? '🍽️' : '🛵'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{job.storeName}</div>
                      <div className="text-xs text-gray-500 capitalize">{job.source}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                </div>
              ))}
              {jobs.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No scrape jobs yet
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap size={18} />
              Quick Actions
            </h3>
            <div className="space-y-3">
              <button 
                onClick={() => startScrapeJob('zomato', 'All Stores')}
                className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🍽️</span>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Scrape All from Zomato</div>
                    <div className="text-xs text-gray-500">Update all mapped stores</div>
                  </div>
                </div>
                <Play size={20} className="text-red-600" />
              </button>

              <button 
                onClick={() => startScrapeJob('swiggy', 'All Stores')}
                className="w-full flex items-center justify-between p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🛵</span>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Scrape All from Swiggy</div>
                    <div className="text-xs text-gray-500">Update all mapped stores</div>
                  </div>
                </div>
                <Play size={20} className="text-orange-600" />
              </button>

              <button 
                className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔗</span>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Auto-Match Unmapped Stores</div>
                    <div className="text-xs text-gray-500">Find Zomato/Swiggy profiles</div>
                  </div>
                </div>
                <Link2 size={20} className="text-blue-600" />
              </button>

              <button 
                onClick={exportPricingReport}
                className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Export Pricing Report</div>
                    <div className="text-xs text-gray-500">Download comparison CSV</div>
                  </div>
                </div>
                <Download size={20} className="text-green-600" />
              </button>
            </div>
          </div>

          {/* Knowledge Pipeline Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Database size={18} />
              Knowledge Pipeline Integration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-600 font-medium">Competitor Pricing</div>
                <div className="text-2xl font-bold text-blue-900 mt-1">{pricing.length}</div>
                <div className="text-xs text-blue-600 mt-1">Items with price comparison</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-purple-600 font-medium">Reviews Collected</div>
                <div className="text-2xl font-bold text-purple-900 mt-1">0</div>
                <div className="text-xs text-purple-600 mt-1">For sentiment analysis</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600 font-medium">Menu Items Indexed</div>
                <div className="text-2xl font-bold text-green-900 mt-1">0</div>
                <div className="text-xs text-green-600 mt-1">For AI recommendations</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Filter size={18} className="text-gray-500" />
              {['all', 'pending', 'completed', 'failed'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setJobFilter(filter as typeof jobFilter)}
                  className={`px-3 py-1 rounded-full text-sm capitalize ${
                    jobFilter === filter
                      ? 'bg-[#059211] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <button
              onClick={exportJobsReport}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reviews</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        job.source === 'zomato' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {job.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{job.storeName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{job.itemsScraped || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{job.reviewsScraped || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {job.createdAt ? new Date(job.createdAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setSelectedJobId(job.id);
                          setShowJobDetailsModal(true);
                        }}
                        className="text-[#059211] hover:underline text-sm"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No jobs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'mappings' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Filter size={18} className="text-gray-500" />
              {['all', 'mapped', 'unmapped'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setMappingFilter(filter as typeof mappingFilter)}
                  className={`px-3 py-1 rounded-full text-sm capitalize ${
                    mappingFilter === filter
                      ? 'bg-[#059211] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
              <Link2 size={16} />
              Auto-Match All
            </button>
            <button
              onClick={exportMappingsReport}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zomato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Swiggy</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Scraped</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mappings.map((mapping) => (
                  <tr key={mapping.storeId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{mapping.storeName}</div>
                      <div className="text-xs text-gray-500">{mapping.storeAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      {mapping.zomatoId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span className="text-sm">⭐ {mapping.zomatoRating || 'N/A'}</span>
                          {mapping.zomatoUrl && (
                            <a href={mapping.zomatoUrl} target="_blank" className="text-blue-500">
                              <ArrowUpRight size={14} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {mapping.swiggyId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span className="text-sm">⭐ {mapping.swiggyRating || 'N/A'}</span>
                          {mapping.swiggyUrl && (
                            <a href={mapping.swiggyUrl} target="_blank" className="text-blue-500">
                              <ArrowUpRight size={14} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs border ${getMatchMethodBadge(mapping.matchMethod)}`}>
                          {mapping.matchMethod.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-gray-600">
                          {(mapping.matchConfidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {mapping.lastScraped ? new Date(mapping.lastScraped).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => startScrapeJob('zomato', mapping.storeName, mapping.storeId)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Scrape from Zomato"
                        >
                          🍽️
                        </button>
                        <button 
                          onClick={() => startScrapeJob('swiggy', mapping.storeName, mapping.storeId)}
                          className="p-1 text-orange-600 hover:bg-orange-50 rounded"
                          title="Scrape from Swiggy"
                        >
                          🛵
                        </button>
                        <button 
                          onClick={() => matchStore(mapping.storeId, mapping.storeName, mapping.storeAddress)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Re-match"
                        >
                          <Link2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {mappings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No store mappings found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'pricing' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Search size={18} className="text-gray-500" />
              <input
                type="text"
                placeholder="Search items..."
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#059211]"
              />
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
              <Download size={16} />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Our Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zomato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Swiggy</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pricing.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.itemName}</td>
                    <td className="px-4 py-3 text-gray-900">₹{item.ourPrice}</td>
                    <td className="px-4 py-3">
                      {item.zomatoPrice ? `₹${item.zomatoPrice}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.swiggyPrice ? `₹${item.swiggyPrice}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.zomatoDiff !== undefined && (
                        <span className={`flex items-center gap-1 ${item.zomatoDiff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.zomatoDiff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          ₹{Math.abs(item.zomatoDiff)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
                {pricing.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No pricing data yet. Run scrape jobs to collect competitor prices.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Scrape Modal */}
      {showNewScrapeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Play className="text-blue-600" size={24} />
              New Scrape Job
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              Scrape competitor data from Zomato or Swiggy. Provide either the restaurant name or direct URL.
            </p>
            
            <div className="space-y-4">
              {/* Source Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setNewScrapeForm({ ...newScrapeForm, source: 'zomato' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                      newScrapeForm.source === 'zomato' 
                        ? 'border-red-500 bg-red-50 text-red-700' 
                        : 'border-gray-200 hover:border-red-300'
                    }`}
                  >
                    <span className="text-2xl">🍽️</span>
                    <span className="font-medium">Zomato</span>
                  </button>
                  <button
                    onClick={() => setNewScrapeForm({ ...newScrapeForm, source: 'swiggy' })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                      newScrapeForm.source === 'swiggy' 
                        ? 'border-orange-500 bg-orange-50 text-orange-700' 
                        : 'border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    <span className="text-2xl">🛵</span>
                    <span className="font-medium">Swiggy</span>
                  </button>
                </div>
              </div>

              {/* Store Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Restaurant Name
                  <span className="text-gray-400 text-xs ml-2">(for search-based scraping)</span>
                </label>
                <input
                  type="text"
                  value={newScrapeForm.storeName}
                  onChange={(e) => setNewScrapeForm({ ...newScrapeForm, storeName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Dominos Pizza, Haldiram's"
                />
              </div>

              {/* City/Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City / Area</label>
                <input
                  type="text"
                  value={newScrapeForm.storeAddress}
                  onChange={(e) => setNewScrapeForm({ ...newScrapeForm, storeAddress: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Nashik, Mumbai"
                />
              </div>

              {/* Direct URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Direct URL
                  <span className="text-gray-400 text-xs ml-2">(optional - for exact restaurant)</span>
                </label>
                <input
                  type="text"
                  value={newScrapeForm.url}
                  onChange={(e) => setNewScrapeForm({ ...newScrapeForm, url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={newScrapeForm.source === 'zomato' 
                    ? "https://www.zomato.com/nashik/restaurant-name" 
                    : "https://www.swiggy.com/restaurants/restaurant-name"
                  }
                />
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <strong>How it works:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>If you provide a <strong>URL</strong>, we&apos;ll scrape that exact restaurant</li>
                  <li>If you provide just the <strong>name</strong>, we&apos;ll search and scrape matching results</li>
                  <li>Data includes: menu items, prices, ratings, reviews</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowNewScrapeModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleNewScrapeSubmit}
                disabled={!newScrapeForm.storeName && !newScrapeForm.url}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Scrape
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {showJobDetailsModal && selectedJobId && (
        <JobDetailsModal
          jobId={selectedJobId}
          onClose={() => setShowJobDetailsModal(false)}
        />
      )}

      {/* Match Store Modal (FSSAI/GST) */}
      {matchStoreForm.showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Link2 className="text-blue-600" size={24} />
              Verify Store Mapping
            </h2>
            <p className="text-gray-600 text-sm mb-4">Provide one or both identifiers to ensure 100% accurate matching.</p>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="font-medium text-gray-900">{matchStoreForm.storeName}</div>
              <div className="text-xs text-gray-600">{matchStoreForm.storeAddress}</div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FSSAI Number</label>
                <input
                  type="text"
                  value={matchStoreForm.fssaiNumber}
                  onChange={(e) => setMatchStoreForm({ ...matchStoreForm, fssaiNumber: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="14-digit FSSAI license number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                <input
                  type="text"
                  value={matchStoreForm.gstNumber}
                  onChange={(e) => setMatchStoreForm({ ...matchStoreForm, gstNumber: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="15-character GSTIN"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <strong>Tip:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Exact identifier match yields the highest confidence</li>
                  <li>Leave one blank if only a single ID is available</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setMatchStoreForm({ ...matchStoreForm, showModal: false })}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitMatchStore}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
