'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAdminStores, Store } from '@/hooks/useAdminCrud';
import { 
  ArrowLeft, Save, Loader2, AlertCircle, Store as StoreIcon, MapPin, Clock
} from 'lucide-react';
import Link from 'next/link';

export default function EditStorePage() {
  const router = useRouter();
  const params = useParams();
  const storeId = Number(params.id);
  
  const { error, getStore, updateStore, clearError } = useAdminStores();
  
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    opening_time: '',
    closing_time: '',
    status: 1,
    module_id: 4,
    logo: '',
    cover_photo: '',
    delivery_time: '',
    minimum_order: '',
  });

  const loadStore = useCallback(async () => {
    try {
      const data = await getStore(storeId);
      setStore(data);
      setFormData({
        name: data.name || '',
        address: data.address || '',
        latitude: data.latitude?.toString() || '',
        longitude: data.longitude?.toString() || '',
        opening_time: data.opening_time || '',
        closing_time: data.closing_time || '',
        status: data.status ?? 1,
        module_id: data.module_id || 4,
        logo: data.logo || '',
        cover_photo: data.cover_photo || '',
        delivery_time: data.delivery_time?.toString() || '',
        minimum_order: data.minimum_order?.toString() || '',
      });
    } catch {
      // error is set in hook
    } finally {
      setPageLoading(false);
    }
  }, [storeId, getStore]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await updateStore(storeId, {
        name: formData.name,
        address: formData.address || undefined,
        latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
        opening_time: formData.opening_time || undefined,
        closing_time: formData.closing_time || undefined,
        status: formData.status,
        module_id: formData.module_id,
        logo: formData.logo || undefined,
        cover_photo: formData.cover_photo || undefined,
        delivery_time: formData.delivery_time ? parseInt(formData.delivery_time) : undefined,
        minimum_order: formData.minimum_order ? parseFloat(formData.minimum_order) : undefined,
      });
      
      router.push('/admin/stores');
    } catch {
      // error is set in hook
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
        <h2 className="text-xl font-semibold text-gray-900">Store not found</h2>
        <Link href="/admin/stores" className="text-purple-600 hover:underline mt-2 inline-block">
          Back to Stores
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/stores"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-4">
            {store.logo ? (
              <picture>
                <img src={store.logo} alt={store.name} className="w-16 h-16 rounded-xl object-cover" />
              </picture>
            ) : (
              <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                <StoreIcon size={32} />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold">{store.name}</h1>
              <p className="text-purple-100 mt-1">
                Store #{store.id} • {store.order_count || 0} orders
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
              Store Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Address */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPin className="inline mr-1" size={16} />
              Address
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Full store address..."
            />
          </div>

          {/* Latitude */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              value={formData.latitude}
              onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="e.g., 19.0760"
            />
          </div>

          {/* Longitude */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={formData.longitude}
              onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="e.g., 72.8777"
            />
          </div>

          {/* Module */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Module *
            </label>
            <select
              value={formData.module_id}
              onChange={(e) => setFormData({ ...formData, module_id: Number(e.target.value) })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value={4}>Food</option>
              <option value={5}>E-commerce</option>
              <option value={13}>Grocery</option>
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
                  className="w-4 h-4 text-purple-600"
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

          {/* Opening Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="inline mr-1" size={16} />
              Opening Time
            </label>
            <input
              type="time"
              value={formData.opening_time}
              onChange={(e) => setFormData({ ...formData, opening_time: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Closing Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="inline mr-1" size={16} />
              Closing Time
            </label>
            <input
              type="time"
              value={formData.closing_time}
              onChange={(e) => setFormData({ ...formData, closing_time: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Delivery Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delivery Time (minutes)
            </label>
            <input
              type="number"
              value={formData.delivery_time}
              onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
              min="0"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="30"
            />
          </div>

          {/* Minimum Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Order (₹)
            </label>
            <input
              type="number"
              value={formData.minimum_order}
              onChange={(e) => setFormData({ ...formData, minimum_order: e.target.value })}
              min="0"
              step="0.01"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="100"
            />
          </div>

          {/* Logo URL */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Logo URL
            </label>
            <div className="flex gap-4">
              <input
                type="url"
                value={formData.logo}
                onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="https://example.com/logo.jpg"
              />
              {formData.logo && (
                <picture>
                  <img 
                    src={formData.logo} 
                    alt="Logo Preview" 
                    className="w-16 h-16 rounded-lg object-cover border border-gray-300"
                  />
                </picture>
              )}
            </div>
          </div>

          {/* Cover Photo URL */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cover Photo URL
            </label>
            <div className="flex gap-4">
              <input
                type="url"
                value={formData.cover_photo}
                onChange={(e) => setFormData({ ...formData, cover_photo: e.target.value })}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="https://example.com/cover.jpg"
              />
              {formData.cover_photo && (
                <picture>
                  <img 
                    src={formData.cover_photo} 
                    alt="Cover Preview" 
                    className="w-24 h-16 rounded-lg object-cover border border-gray-300"
                  />
                </picture>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-4 justify-end">
          <Link
            href="/admin/stores"
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 transition-colors disabled:opacity-50"
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
