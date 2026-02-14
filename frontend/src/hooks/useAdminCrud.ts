/**
 * Admin CRUD Hooks for Items, Stores, and Categories
 * Connects to Search API Admin endpoints
 */
import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_SEARCH_API_URL || 'http://localhost:3100';

// ============================================
// Types
// ============================================

export interface QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'ASC' | 'DESC';
  status?: number;
  module_id?: number;
  store_id?: number;
  category_id?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface Item {
  id: number;
  name: string;
  description: string;
  price: string;
  discount: string;
  veg: number;
  status: number;
  store_id: number;
  category_id: number;
  module_id: number;
  avg_rating: number;
  rating_count: number;
  order_count: number;
  image?: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  email?: string;
  status: number;
  module_id: number;
  avg_rating: number;
  rating_count: number;
  order_count: number;
  logo?: string;
  cover_photo?: string;
  opening_time?: string;
  closing_time?: string;
  delivery_time?: number;
  minimum_order?: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  module_id: number;
  position: number;
  status: number;
  image?: string;
  created_at: string;
  updated_at: string;
  children?: Category[];
}

export interface CreateItemDto {
  name: string;
  description?: string;
  price: number;
  discount?: number;
  veg?: number;
  status?: number;
  store_id: number;
  category_id: number;
  module_id: number;
  image?: string;
}

export type UpdateItemDto = Partial<CreateItemDto>;

export interface CreateStoreDto {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  status?: number;
  module_id: number;
  logo?: string;
  cover_photo?: string;
  opening_time?: string;
  closing_time?: string;
  delivery_time?: number;
  minimum_order?: number;
}

export type UpdateStoreDto = Partial<CreateStoreDto>;

export interface CreateCategoryDto {
  name: string;
  parent_id?: number;
  module_id: number;
  position?: number;
  status?: number;
  image?: string;
}

export type UpdateCategoryDto = Partial<CreateCategoryDto>;

// ============================================
// Error Helper
// ============================================

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unknown error occurred';
}

// ============================================
// Generic Fetch Helper
// ============================================

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Helper to build query string
function buildQueryString(params: QueryParams): string {
  return new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number] => {
        const value = entry[1];
        return value !== undefined && value !== '';
      })
      .map(([key, value]) => [key, String(value)])
  ).toString();
}

// ============================================
// Items Hook
// ============================================

export function useAdminItems() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchItems = useCallback(async (params: QueryParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const queryString = buildQueryString(params);
      const result = await fetchApi<{ data: Item[]; meta: PaginationMeta }>(
        `/admin/items${queryString ? `?${queryString}` : ''}`
      );
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getItem = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Item>(`/admin/items/${id}`);
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createItem = useCallback(async (data: CreateItemDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Item>('/admin/items', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateItem = useCallback(async (id: number, data: UpdateItemDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Item>(`/admin/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteItem = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean }>(`/admin/items/${id}`, {
        method: 'DELETE',
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkUpdate = useCallback(async (ids: number[], updateData: UpdateItemDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ updated: number }>('/admin/items/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids, updateData }),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    clearError,
    fetchItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
    bulkUpdate,
  };
}

// ============================================
// Stores Hook
// ============================================

export function useAdminStores() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchStores = useCallback(async (params: QueryParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const queryString = buildQueryString(params);
      const result = await fetchApi<{ data: Store[]; meta: PaginationMeta }>(
        `/admin/stores${queryString ? `?${queryString}` : ''}`
      );
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStore = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Store>(`/admin/stores/${id}`);
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createStore = useCallback(async (data: CreateStoreDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Store>('/admin/stores', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStore = useCallback(async (id: number, data: UpdateStoreDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Store>(`/admin/stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStore = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean }>(`/admin/stores/${id}`, {
        method: 'DELETE',
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    clearError,
    fetchStores,
    getStore,
    createStore,
    updateStore,
    deleteStore,
  };
}

// ============================================
// Categories Hook
// ============================================

export function useAdminCategories() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchCategories = useCallback(async (params: QueryParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const queryString = buildQueryString(params);
      const result = await fetchApi<{ data: Category[]; meta: PaginationMeta }>(
        `/admin/categories${queryString ? `?${queryString}` : ''}`
      );
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategoryTree = useCallback(async (moduleId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const queryString = moduleId ? `?module_id=${moduleId}` : '';
      const result = await fetchApi<Category[]>(`/admin/categories/tree${queryString}`);
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCategory = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Category>(`/admin/categories/${id}`);
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (data: CreateCategoryDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Category>('/admin/categories', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCategory = useCallback(async (id: number, data: UpdateCategoryDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<Category>(`/admin/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCategory = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean }>(`/admin/categories/${id}`, {
        method: 'DELETE',
      });
      return result;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    clearError,
    fetchCategories,
    fetchCategoryTree,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
