'use client';

import { useState, useEffect } from 'react';
import { adminBackendClient } from '@/lib/api/admin-backend';
import { RoleGuard, useToast } from '@/components/shared';
import { useAdminAuthStore } from '@/store/adminAuthStore';
import {
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  RefreshCw,
  Users,
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const ROLES = ['super_admin', 'admin', 'manager', 'reviewer', 'viewer'] as const;

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-800',
  admin: 'bg-blue-100 text-blue-800',
  manager: 'bg-purple-100 text-purple-800',
  reviewer: 'bg-green-100 text-green-800',
  viewer: 'bg-gray-100 text-gray-700',
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  super_admin: ShieldAlert,
  admin: ShieldCheck,
  manager: Shield,
  reviewer: Eye,
  viewer: Eye,
};

export default function AdminUsersPage() {
  const { user: currentUser } = useAdminAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const toast = useToast();

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [showPassword, setShowPassword] = useState(false);

  // Role edit state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminBackendClient.listAdminUsers();
      if (result.success) {
        setUsers(result.users as unknown as AdminUser[]);
      } else {
        setError('Failed to load admin users');
      }
    } catch {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    try {
      const result = await adminBackendClient.createAdminUser({
        email: newEmail,
        password: newPassword,
        name: newName,
        role: newRole,
      });
      if (result.success) {
        setShowCreateForm(false);
        setNewEmail('');
        setNewName('');
        setNewPassword('');
        setNewRole('viewer');
        loadUsers();
      } else {
        setCreateError(result.message || 'Failed to create admin');
      }
    } catch {
      setCreateError('Unable to connect to server');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRoleUpdate = async (adminId: string) => {
    try {
      const result = await adminBackendClient.updateAdminRole(adminId, editRole);
      if (result.success) {
        setEditingRoleId(null);
        loadUsers();
      }
    } catch {
      // silent
    }
  };

  const handleDeactivate = (adminId: string, adminName: string) =>
    setDeactivateTarget({ id: adminId, name: adminName });

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const { id } = deactivateTarget;
    setDeactivateTarget(null);
    try {
      const result = await adminBackendClient.deactivateAdmin(id);
      if (result.success) {
        loadUsers();
        toast.success('Admin deactivated');
      }
    } catch {
      toast.error('Failed to deactivate admin');
    }
  };

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage admin accounts and roles</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadUsers}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <UserPlus size={16} />
              Create Admin
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Create Admin Form */}
      {showCreateForm && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Admin</h2>
          {createError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Full name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="user@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
                  placeholder="Min 8 chars, mixed case + digit + special"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createLoading ? 'Creating...' : 'Create Admin'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Last Login</th>
                  {isSuperAdmin && (
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((admin) => {
                  const RoleIcon = ROLE_ICONS[admin.role] || Eye;
                  return (
                    <tr key={admin.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-medium text-sm">
                            {admin.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{admin.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                      <td className="px-4 py-3">
                        {editingRoleId === admin.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="px-2 py-1 border rounded text-xs bg-white"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleRoleUpdate(admin.id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRoleId(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[admin.role] || 'bg-gray-100 text-gray-700'}`}
                          >
                            <RoleIcon size={12} />
                            {admin.role.replace('_', ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            admin.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {admin.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDate(admin.lastLoginAt)}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3 text-right">
                          {admin.id !== currentUser?.id && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingRoleId(admin.id);
                                  setEditRole(admin.role);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Change Role
                              </button>
                              {admin.isActive && (
                                <button
                                  onClick={() => handleDeactivate(admin.id, admin.name)}
                                  className="text-xs text-red-600 hover:text-red-800"
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      <Users className="mx-auto mb-2" size={32} />
                      No admin users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>

      {/* Deactivate Confirmation Modal */}
      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Deactivate Admin</h3>
            <p className="text-gray-600 text-sm mb-6">
              Deactivate admin <strong>"{deactivateTarget.name}"</strong>? They will no longer be able to log in.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeactivateTarget(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivate}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
