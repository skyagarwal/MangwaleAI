'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminItems, useAdminStores, useAdminCategories, Store, Category } from '@/hooks/useAdminCrud';
import { 
  ArrowLeft, Plus, Loader2, AlertCircle, Package
} from 'lucide-react';
import Link from 'next/link';

export default function NewItemPage() {
  const router = useRouter();
  
  const { error, createItem, clearError } = useAdminItems();
  const { fetchStores } = useAdminStores();
  const { fetchCategories } = useAdminCategories();
  
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    discount: '',
    veg: 1,
    status: 1,
    store_id: '',
    category_id: '',
    module_id: 4,
    image: '',
  });

  const loadStoresAndCategories = useCallback(async (moduleId: number) => {
    try {
      const [storesData, categoriesData] = await Promise.all([
        fetchStores({ module_id: moduleId, limit: 500, status: 1 }),
        fetchCategories({ module_id: moduleId, limit: 500, status: 1 }),
      ]);
      setStores(storesData.data);
      setCategories(categoriesData.data);
    } catch {
      // error is set in hook
    }
  }, [fetchStores, fetchCategories]);

  useEffect(() => {
    loadStoresAndCategories(4);
  }, [loadStoresAndCategories]);

  const handleModuleChange = async (moduleId: number) => {
    setFormData({ ...formData, module_id: moduleId, store_id: '', category_id: '' });
    await loadStoresAndCategories(moduleId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await createItem({
        name: formData.name,
        description: formData.description || undefined,
        price: parseFloat(formData.price),
        discount: formData.discount ? parseFloat(formData.discount) : undefined,
        veg: formData.veg,
        status: formData.status,
        store_id: parseInt(formData.store_id),
        category_id: parseInt(formData.category_id),
        module_id: formData.module_id,
        image: formData.image || undefined,
      });
      
      router.push('/admin/items');
    } catch {
      // error is set in hook
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/items"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Package className="h-8 w-8" />
              Create New Item
            </h1>
            <p className="text-green-100 mt-2">
              Add a new item and sync to search
            </p>
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
              Item Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="e.g., Chicken Biryani"
            />
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Describe the item..."
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
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value={4}>Food</option>
              <option value={5}>E-commerce</option>
              <option value={13}>Grocery</option>
            </select>
          </div>

          {/* Store */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Store *
            </label>
            <select
              value={formData.store_id}
              onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Select Store</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name} (#{store.id})</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name} (#{cat.id})</option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Price (₹) *
            </label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              required
              min="0"
              step="0.01"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="0.00"
            />
          </div>

          {/* Discount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Discount (%)
            </label>
            <input
              type="number"
              value={formData.discount}
              onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
              min="0"
              max="100"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="0"
            />
          </div>

          {/* Veg/Non-veg */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Food Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="veg"
                  checked={formData.veg === 1}
                  onChange={() => setFormData({ ...formData, veg: 1 })}
                  className="w-4 h-4 text-green-600"
                />
                <span className="text-green-700">🌱 Vegetarian</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="veg"
                  checked={formData.veg === 0}
                  onChange={() => setFormData({ ...formData, veg: 0 })}
                  className="w-4 h-4 text-red-600"
                />
                <span className="text-red-700">🍖 Non-Vegetarian</span>
              </label>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={formData.status === 1}
                  onChange={() => setFormData({ ...formData, status: 1 })}
                  className="w-4 h-4 text-green-600"
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
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
            href="/admin/items"
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus size={18} />
                Create Item
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
