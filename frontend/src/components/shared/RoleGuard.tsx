'use client';

import { useAdminAuthStore } from '@/store/adminAuthStore';
import { Shield } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

/**
 * Wraps page content and shows a 403 error if the current user lacks the required role.
 * Usage: <RoleGuard allowedRoles={['super_admin', 'admin']}>{children}</RoleGuard>
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { user, isAuthenticated } = useAdminAuthStore();

  if (!isAuthenticated || !user) return null;

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield size={56} className="text-red-300 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-500 mb-1">You don&apos;t have permission to view this page.</p>
        <p className="text-sm text-gray-400">
          Required role{allowedRoles.length > 1 ? 's' : ''}: {allowedRoles.join(', ')}
        </p>
        <p className="text-sm text-gray-400 mt-0.5">
          Your role: <span className="font-medium">{user.role}</span>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
