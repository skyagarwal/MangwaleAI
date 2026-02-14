'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminItems, Item, QueryParams, PaginationMeta } from '@/hooks/useAdminCrud';
import { 
  Search, Plus, Edit, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  Package, Store, Tag, CheckCircle2, XCircle, Loader2, AlertCircle
} from 'lucide-react';
import Link from 'next/link';

const MODULE_OPTIONS = [
  { value: 4, label: 'Food' },
  { value: 5, label: 'E-commerce' },
  { value: 13, label: 'Grocery' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 1, label: 'Active' },
  { value: 0, label: 'Inactive' },
];

export default function ItemsManagementPage() {
  const { loading, error, clearError, fetchItems, deleteItem, bulkUpdate } = useAdminItems();
  
  const [items, setItems] = useState<Item[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, total_pages: 1 });
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<number | null>(null);
  
  const [filters, setFilters] = useState<QueryParams>({
    page: 1,
    limit: 20,
    search: '',
    module_id: 4,
    status: undefined,
    sort_by: 'id',
    sort_order: 'DESC',
  });

  const loadItems = useCallback(async () => {
    try {
      const data = await fetchItems(filters);
      setItems(data.data);
      setMeta(data.meta);
    } catch {
      // error is set in hook
    }
  }, [fetchItems, filters]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, page: 1 });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item? This will also remove it from search.')) return;
    
    setDeleting(id);
    try {
      await deleteItem(id);
      await loadItems();
    } catch {
      alert('Failed to delete item');
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkStatusUpdate = async (status: number) => {
    if (selectedItems.length === 0) return;
    if (!confirm(`Update ${selectedItems.length} items to ${status === 1 ? 'Active' : 'Inactive'}?`)) return;

    try {
      await bulkUpdate(selectedItems, { status });
      setSelectedItems([]);
      await loadItems();
    } catch {
      alert('Failed to update items');
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map(item => item.id));
    }
  };

  const toggleSelectItem = (id: number) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Package className="h-8 w-8" />
              Items Management
            </h1>
            <p className="text-purple-100 mt-2">
              Manage all menu items across all stores • {meta.total.toLocaleString()} total items
            </p>
          </div>
          <Link
            href="/admin/items/new"
            className="px-6 py-3 bg-white text-purple-600 rounded-lg hover:bg-purple-50 flex items-center gap-2 font-semibold transition-colors"
          >
            <Plus size={20} />
            Add New Item
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

      {/* Filters */}
      <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search items by name or description..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>
          
          <select
            value={filters.module_id}
            onChange={(e) => setFilters({ ...filters, module_id: Number(e.target.value), page: 1 })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {MODULE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label} Module</option>
            ))}
          </select>
          
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={`${filters.sort_by}:${filters.sort_order}`}
            onChange={(e) => {
              const [sort_by, sort_order] = e.target.value.split(':');
              setFilters({ ...filters, sort_by, sort_order: sort_order as 'ASC' | 'DESC' });
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="id:DESC">Newest First</option>
            <option value="id:ASC">Oldest First</option>
            <option value="name:ASC">Name A-Z</option>
            <option value="name:DESC">Name Z-A</option>
            <option value="price:ASC">Price Low-High</option>
            <option value="price:DESC">Price High-Low</option>
            <option value="order_count:DESC">Most Ordered</option>
          </select>
          
          <button
            type="submit"
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 transition-colors"
          >
            <Search size={18} />
            Search
          </button>
          
          <button
            type="button"
            onClick={loadItems}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </form>

        {/* Bulk Actions */}
        {selectedItems.length > 0 && (
          <div className="mt-4 flex items-center gap-4 p-3 bg-purple-50 rounded-lg">
            <span className="text-purple-700 font-medium">
              {selectedItems.length} items selected
            </span>
            <button
              onClick={() => handleBulkStatusUpdate(1)}
              className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              Set Active
            </button>
            <button
              onClick={() => handleBulkStatusUpdate(0)}
              className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
            >
              Set Inactive
            </button>
            <button
              onClick={() => setSelectedItems([])}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Price</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Store</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Orders</th>
                <th className="px-4 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                    <p className="mt-2">Loading items...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    <Package className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    <p>No items found</p>
                    <p className="text-sm">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">{item.id}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {item.image && (
                          <picture>
                            <img 
                              src={item.image} 
                              alt={item.name}
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                          </picture>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{item.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium">
                      ₹{parseFloat(item.price).toFixed(0)}
                      {parseFloat(item.discount) > 0 && (
                        <span className="text-green-600 text-xs ml-1">(-{item.discount}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Store size={14} className="text-gray-400" />
                        {item.store_id}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Tag size={14} className="text-gray-400" />
                        {item.category_id}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.veg === 1 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {item.veg === 1 ? '🌱 Veg' : '🍖 Non-Veg'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit ${
                        item.status === 1 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {item.status === 1 ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {item.status === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {item.order_count?.toLocaleString() || 0}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/items/${item.id}`}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </Link>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deleting === item.id}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deleting === item.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Showing {((meta.page - 1) * meta.limit) + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString()} items
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page! - 1) })}
              disabled={meta.page === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, meta.total_pages) }, (_, i) => {
                let pageNum: number;
                if (meta.total_pages <= 5) {
                  pageNum = i + 1;
                } else if (meta.page <= 3) {
                  pageNum = i + 1;
                } else if (meta.page >= meta.total_pages - 2) {
                  pageNum = meta.total_pages - 4 + i;
                } else {
                  pageNum = meta.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setFilters({ ...filters, page: pageNum })}
                    className={`w-10 h-10 rounded-lg ${
                      meta.page === pageNum
                        ? 'bg-purple-600 text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setFilters({ ...filters, page: Math.min(meta.total_pages, filters.page! + 1) })}
              disabled={meta.page === meta.total_pages}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
