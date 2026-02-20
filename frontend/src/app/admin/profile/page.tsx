'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Shield, Clock, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAdminAuthStore } from '@/store/adminAuthStore';
import { adminBackendClient } from '@/lib/api/admin-backend';
import { useToast } from '@/components/shared';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-green-100 text-green-700 border-green-200',
  reviewer: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  viewer: 'bg-gray-100 text-gray-600 border-gray-200',
};

interface ProfileData {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt?: string;
}

export default function ProfilePage() {
  const { user } = useAdminAuthStore();
  const toast = useToast();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Change password form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    adminBackendClient
      .getProfile()
      .then((res) => {
        if (res.success) {
          setProfile(res.user as unknown as ProfileData);
        }
      })
      .catch(() => {
        // fall back to Zustand user data if API fails
      })
      .finally(() => setLoading(false));
  }, []);

  const displayUser = profile ?? (user as unknown as ProfileData);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return 'At least 8 characters required';
    if (!/[A-Z]/.test(pwd)) return 'Must contain an uppercase letter';
    if (!/[a-z]/.test(pwd)) return 'Must contain a lowercase letter';
    if (!/[0-9]/.test(pwd)) return 'Must contain a digit';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) return 'Must contain a special character';
    return null;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setChangingPassword(true);
    try {
      const res = await adminBackendClient.changePassword(oldPassword, newPassword);
      if (res.success) {
        toast.success('Password changed successfully');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(res.message || 'Failed to change password');
      }
    } catch {
      toast.error('Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const passwordStrength = (() => {
    if (!newPassword) return null;
    const checks = [
      newPassword.length >= 8,
      /[A-Z]/.test(newPassword),
      /[a-z]/.test(newPassword),
      /[0-9]/.test(newPassword),
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword),
    ];
    const passed = checks.filter(Boolean).length;
    if (passed <= 2) return { label: 'Weak', color: 'bg-red-400', width: 'w-1/5' };
    if (passed <= 3) return { label: 'Fair', color: 'bg-yellow-400', width: 'w-3/5' };
    if (passed === 4) return { label: 'Good', color: 'bg-blue-400', width: 'w-4/5' };
    return { label: 'Strong', color: 'bg-green-400', width: 'w-full' };
  })();

  const roleKey = displayUser?.role ?? 'viewer';
  const roleBadge = ROLE_COLORS[roleKey] ?? ROLE_COLORS.viewer;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">View your account details and change your password</p>
      </div>

      {/* Profile info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <User size={18} />
          Account Details
        </h2>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 bg-gray-100 rounded w-3/4" />
            ))}
          </div>
        ) : (
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <User size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Name</dt>
                <dd className="font-medium text-gray-900">{displayUser?.name ?? '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Email</dt>
                <dd className="font-medium text-gray-900">{displayUser?.email ?? '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Role</dt>
                <dd>
                  <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full border font-medium ${roleBadge}`}>
                    {ROLE_LABELS[roleKey] ?? roleKey}
                  </span>
                </dd>
              </div>
            </div>
            {profile?.createdAt && (
              <div className="flex items-start gap-3">
                <Clock size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wide">Member since</dt>
                  <dd className="font-medium text-gray-900">
                    {new Date(profile.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </dd>
                </div>
              </div>
            )}
            {profile?.lastLoginAt && (
              <div className="flex items-start gap-3">
                <Clock size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wide">Last login</dt>
                  <dd className="font-medium text-gray-900">
                    {new Date(profile.lastLoginAt).toLocaleString('en-IN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </dd>
                </div>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Change password card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <Lock size={18} />
          Change Password
        </h2>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {/* Current password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                placeholder="Enter current password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Enter new password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Password strength meter */}
            {passwordStrength && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${passwordStrength.color} ${passwordStrength.width}`} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Strength: {passwordStrength.label}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Min 8 chars · uppercase · lowercase · digit · special character
            </p>
          </div>

          {/* Confirm new password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repeat new password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword && newPassword && (
              <div className="flex items-center gap-1.5 mt-1">
                {newPassword === confirmPassword ? (
                  <>
                    <CheckCircle2 size={13} className="text-green-500" />
                    <span className="text-xs text-green-600">Passwords match</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={13} className="text-red-500" />
                    <span className="text-xs text-red-600">Passwords do not match</span>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
