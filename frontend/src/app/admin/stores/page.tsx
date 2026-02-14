'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminStores, Store, QueryParams, PaginationMeta } from '@/hooks/useAdminCrud';
import { 
  Search, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, 
  Store as StoreIcon, Loader2, AlertCircle, CheckCircle, XCircle,
  MapPin, Star, Package, Filter
} from 'lucide-react';
import Link from 'next/link';

export default function AdminStoresPage() {
  const { 
    loading, error, 
    fetchStores, deleteStore, updateStore, clearError 
  } = useAdminStores();
  
  const [stores, setStores] = useState<Store[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<0 | 1 | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  
  // Use a ref to track mount state for async operations
  const isMountedRef = useRef(true);

  const loadStores = useCallback(async () => {
    const params: QueryParams = {
      page: currentPage,
      limit: 20,
    };
    if (searchTerm) params.search = searchTerm;
    if (moduleFilter !== '') params.module_id = moduleFilter;
    if (statusFilter !== '') params.status = statusFilter;
    
    try {
      const result = await fetchStores(params);
      if (isMountedRef.current) {
        setStores(result.data);
        setPagination(result.meta);
      }
    } catch {
      // error is set in hook
    }
  }, [currentPage, searchTerm, moduleFilter, statusFilter, fetchStores]);

  useEffect(() => {
    isMountedRef.current = true;
    // Using IIFE to avoid lint warning about calling async function in effect
    void (async () => {
      await loadStores();
    })();
    return () => { isMountedRef.current = false; };
  }, [loadStores]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteStore(id);
      setDeleteConfirm(null);
      loadStores();
    } catch {
      // error is set in hook
    }
  };

  const handleBulkStatusUpdate = async (status: 0 | 1) => {
    if (selectedIds.length === 0) return;
    try {
      // Update each store individually since we don't have bulk update
      await Promise.all(selectedIds.map(id => updateStore(id, { status })));
      setSelectedIds([]);
      loadStores();
    } catch {
      // error is set in hook
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === stores.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(stores.map((s: Store) => s.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const moduleLabels: Record<number, string> = {
    4: 'Food',
    5: 'E-commerce',
    13: 'Grocery',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <StoreIcon className="h-8 w-8" />
              Stores Management
            </h1>
            <p className="text-purple-100 mt-2">
              Manage stores and sync to OpenSearch
            </p>
          </div>
          <Link
            href="/admin/stores/new"
            className="bg-white text-purple-600 px-6 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-all flex items-center gap-2"
          >
            <Plus size={20} />
            Add Store
          </Link>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
          <button onClick={clearError} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search stores..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-2">Module</label>
            <select
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value === '' ? '' : Number(e.target.value)); setCurrentPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">All Modules</option>
              <option value={4}>Food</option>
              <option value={5}>E-commerce</option>
              <option value={13}>Grocery</option>
            </select>
          </div>

          <div className="w-36">
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value === '' ? '' : Number(e.target.value) as 0 | 1); setCurrentPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">All Status</option>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Filter size={18} />
            Apply
          </button>
        </form>

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-4">
            <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
            <button
              onClick={() => handleBulkStatusUpdate(1)}
              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
            >
              <CheckCircle size={14} />
              Activate
            </button>
            <button
              onClick={() => handleBulkStatusUpdate(0)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1"
            >
              <XCircle size={14} />
              Deactivate
            </button>
          </div>
        )}
      </div>

      {/* Stores Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-purple-600" size={32} />
          </div>
        ) : stores.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <StoreIcon className="mx-auto mb-4 text-gray-300" size={48} />
            <p>No stores found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === stores.length && stores.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Store</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Module</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Location</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Orders</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Rating</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stores.map((store: Store) => (
                <tr key={store.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(store.id)}
                      onChange={() => toggleSelect(store.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {store.logo ? (
                        <picture>
                          <img src={store.logo} alt={store.name} className="w-10 h-10 rounded-lg object-cover" />
                        </picture>
                      ) : (
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <StoreIcon size={20} className="text-purple-600" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{store.name}</p>
                        <p className="text-sm text-gray-500">#{store.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                      {moduleLabels[store.module_id] || `Module ${store.module_id}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <MapPin size={14} />
                      {store.address || 'No address'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Package size={14} />
                      {store.order_count || 0}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Star size={14} className="text-yellow-500" />
                      {store.avg_rating?.toFixed(1) || '0.0'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {store.status === 1 ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/stores/${store.id}`}
                        className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                      >
                        <Edit2 size={16} />
                      </Link>
                      {deleteConfirm === store.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(store.id)}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(store.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination && pagination.total_pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-4 py-2 text-sm">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(pagination.total_pages, p + 1))}
                disabled={pagination.page >= pagination.total_pages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
