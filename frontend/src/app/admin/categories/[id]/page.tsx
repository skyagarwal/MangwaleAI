'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAdminCategories, Category } from '@/hooks/useAdminCrud';
import { 
  ArrowLeft, Save, Loader2, AlertCircle, Tag, Layers
} from 'lucide-react';
import Link from 'next/link';

export default function EditCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const categoryId = Number(params.id);
  
  const { error, getCategory, fetchCategories, updateCategory, clearError } = useAdminCategories();
  
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    status: 1,
    module_id: 4,
    parent_id: '' as string | number,
    position: '',
    image: '',
  });

  const loadParentCategories = useCallback(async (moduleId: number) => {
    try {
      const result = await fetchCategories({ module_id: moduleId, limit: 500, status: 1 });
      // Filter out current category and its children
      setParentCategories(result.data.filter((c: Category) => c.id !== categoryId && c.parent_id !== categoryId));
    } catch {
      // error is set in hook
    }
  }, [categoryId, fetchCategories]);

  const loadCategory = useCallback(async () => {
    try {
      const data = await getCategory(categoryId);
      setCategory(data);
      setFormData({
        name: data.name || '',
        status: data.status ?? 1,
        module_id: data.module_id || 4,
        parent_id: data.parent_id || '',
        position: data.position?.toString() || '',
        image: data.image || '',
      });
      // Load parent categories for the same module
      await loadParentCategories(data.module_id);
    } catch {
      // error is set in hook
    } finally {
      setPageLoading(false);
    }
  }, [categoryId, getCategory, loadParentCategories]);

  useEffect(() => {
    loadCategory();
  }, [loadCategory]);

  const handleModuleChange = async (moduleId: number) => {
    setFormData({ ...formData, module_id: moduleId, parent_id: '' });
    await loadParentCategories(moduleId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await updateCategory(categoryId, {
        name: formData.name,
        status: formData.status,
        module_id: formData.module_id,
        parent_id: formData.parent_id ? Number(formData.parent_id) : undefined,
        position: formData.position ? parseInt(formData.position) : undefined,
        image: formData.image || undefined,
      });
      
      router.push('/admin/categories');
    } catch {
      // error is set in hook
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-orange-600" size={32} />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
        <h2 className="text-xl font-semibold text-gray-900">Category not found</h2>
        <Link href="/admin/categories" className="text-orange-600 hover:underline mt-2 inline-block">
          Back to Categories
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/categories"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-4">
            {category.image ? (
              <picture>
                <img src={category.image} alt={category.name} className="w-16 h-16 rounded-xl object-cover" />
              </picture>
            ) : (
              <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                <Tag size={32} />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold">{category.name}</h1>
              <p className="text-orange-100 mt-1">
                Category #{category.id}
              </p>
            </div>
          </div>
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

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 shadow-md border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* Module */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Module *
            </label>
            <select
              value={formData.module_id}
              onChange={(e) => handleModuleChange(Number(e.target.value))}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value={4}>Food</option>
              <option value={5}>E-commerce</option>
              <option value={13}>Grocery</option>
            </select>
          </div>

          {/* Parent Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Layers className="inline mr-1" size={16} />
              Parent Category
            </label>
            <select
              value={formData.parent_id}
              onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">None (Root Category)</option>
              {parentCategories.map((cat: Category) => (
                <option key={cat.id} value={cat.id}>{cat.name} (#{cat.id})</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={formData.status === 1}
                  onChange={() => setFormData({ ...formData, status: 1 })}
                  className="w-4 h-4 text-orange-600"
                />
                <span className="text-green-700">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={formData.status === 0}
                  onChange={() => setFormData({ ...formData, status: 0 })}
                  className="w-4 h-4 text-red-600"
                />
                <span className="text-red-700">Inactive</span>
              </label>
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort Position
            </label>
            <input
              type="number"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              min="0"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="0"
            />
          </div>

          {/* Image URL */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image URL
            </label>
            <div className="flex gap-4">
              <input
                type="url"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="https://example.com/image.jpg"
              />
              {formData.image && (
                <picture>
                  <img 
                    src={formData.image} 
                    alt="Preview" 
                    className="w-16 h-16 rounded-lg object-cover border border-gray-300"
                  />
                </picture>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4 justify-end">
          <Link
            href="/admin/categories"
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
