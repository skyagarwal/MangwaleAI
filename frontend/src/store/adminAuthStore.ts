import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: Array<{ module: string; actions: string[] }>;
}

interface AdminAuthState {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setAuth: (user: AdminUser, token: string) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<AdminUser>) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      clearAuth: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),

      setHasHydrated: (hasHydrated) => {
        set({ _hasHydrated: hasHydrated });
      },
    }),
    {
      name: 'admin-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
