'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminCategories, Category, QueryParams, PaginationMeta } from '@/hooks/useAdminCrud';
import { 
  Search, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, 
  Tag, Loader2, AlertCircle, CheckCircle, XCircle,
  Filter, Layers
} from 'lucide-react';
import Link from 'next/link';

export default function AdminCategoriesPage() {
  const { 
    loading, error, 
    fetchCategories, deleteCategory, updateCategory, clearError 
  } = useAdminCategories();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<0 | 1 | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  
  // Use a ref to track mount state for async operations
  const isMountedRef = useRef(true);

  const loadCategories = useCallback(async () => {
    const params: QueryParams = {
      page: currentPage,
      limit: 20,
    };
    if (searchTerm) params.search = searchTerm;
    if (moduleFilter !== '') params.module_id = moduleFilter;
    if (statusFilter !== '') params.status = statusFilter;
    
    try {
      const result = await fetchCategories(params);
      if (isMountedRef.current) {
        setCategories(result.data);
        setPagination(result.meta);
      }
    } catch {
      // error is set in hook
    }
  }, [currentPage, searchTerm, moduleFilter, statusFilter, fetchCategories]);

  useEffect(() => {
    isMountedRef.current = true;
    // Using IIFE to avoid lint warning about calling async function in effect
    void (async () => {
      await loadCategories();
    })();
    return () => { isMountedRef.current = false; };
  }, [loadCategories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCategory(id);
      setDeleteConfirm(null);
      loadCategories();
    } catch {
      // error is set in hook
    }
  };

  const handleBulkStatusUpdate = async (status: 0 | 1) => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => updateCategory(id, { status })));
      setSelectedIds([]);
      loadCategories();
    } catch {
      // error is set in hook
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === categories.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(categories.map((c: Category) => c.id));
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
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Tag className="h-8 w-8" />
              Categories Management
            </h1>
            <p className="text-orange-100 mt-2">
              Manage categories and sync to OpenSearch
            </p>
          </div>
          <Link
            href="/admin/categories/new"
            className="bg-white text-orange-600 px-6 py-3 rounded-xl font-semibold hover:bg-orange-50 transition-all flex items-center gap-2"
          >
            <Plus size={20} />
            Add Category
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
                placeholder="Search categories..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>

          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-2">Module</label>
            <select
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value === '' ? '' : Number(e.target.value)); setCurrentPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">All Status</option>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
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

      {/* Categories Table */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-orange-600" size={32} />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Tag className="mx-auto mb-4 text-gray-300" size={48} />
            <p>No categories found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === categories.length && categories.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Module</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Parent</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Position</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((category: Category) => (
                <tr key={category.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(category.id)}
                      onChange={() => toggleSelect(category.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {category.image ? (
                        <picture>
                          <img src={category.image} alt={category.name} className="w-10 h-10 rounded-lg object-cover" />
                        </picture>
                      ) : (
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                          <Tag size={20} className="text-orange-600" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{category.name}</p>
                        <p className="text-sm text-gray-500">#{category.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
                      {moduleLabels[category.module_id] || `Module ${category.module_id}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {category.parent_id ? (
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Layers size={14} />
                        #{category.parent_id}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Root</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {category.position ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {category.status === 1 ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/categories/${category.id}`}
                        className="p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                      >
                        <Edit2 size={16} />
                      </Link>
                      {deleteConfirm === category.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(category.id)}
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
                          onClick={() => setDeleteConfirm(category.id)}
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
