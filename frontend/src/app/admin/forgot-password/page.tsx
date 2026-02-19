'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminBackendClient } from '@/lib/api/admin-backend';
import { ArrowLeft, Mail, KeyRound, ShieldCheck, CheckCircle } from 'lucide-react';

type Step = 'email' | 'otp' | 'reset' | 'success';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email'); return; }

    setLoading(true);
    try {
      const result = await adminBackendClient.forgotPassword(email);
      if (result.success) {
        setStep('otp');
      } else {
        setError(result.message);
      }
    } catch {
      setError('Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!otp || otp.length !== 6) { setError('Please enter a 6-digit OTP'); return; }

    setLoading(true);
    try {
      const result = await adminBackendClient.verifyOtp(email, otp);
      if (result.success && result.resetToken) {
        setResetToken(result.resetToken);
        setStep('reset');
      } else {
        setError(result.message);
      }
    } catch {
      setError('Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(newPassword)) { setError('Password must contain an uppercase letter'); return; }
    if (!/[a-z]/.test(newPassword)) { setError('Password must contain a lowercase letter'); return; }
    if (!/[0-9]/.test(newPassword)) { setError('Password must contain a digit'); return; }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) { setError('Password must contain a special character'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const result = await adminBackendClient.resetPassword(resetToken, newPassword);
      if (result.success) {
        setStep('success');
      } else {
        setError(result.message);
      }
    } catch {
      setError('Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 px-8 py-6 text-center">
            <h1 className="text-2xl font-bold text-white">Reset Password</h1>
            <p className="text-blue-200 text-sm mt-1">
              {step === 'email' && 'Enter your email to receive a reset code'}
              {step === 'otp' && 'Enter the OTP sent to your email'}
              {step === 'reset' && 'Choose a new password'}
              {step === 'success' && 'Password reset complete'}
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-5">
                {error}
              </div>
            )}

            {/* Step 1: Email */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                <div className="flex justify-center mb-2">
                  <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                    <Mail className="text-blue-600" size={28} />
                  </div>
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Enter your email"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Sending...' : 'Send OTP'}
                </button>
              </form>
            )}

            {/* Step 2: OTP */}
            {step === 'otp' && (
              <form onSubmit={handleOtpSubmit} className="space-y-5">
                <div className="flex justify-center mb-2">
                  <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                    <KeyRound className="text-blue-600" size={28} />
                  </div>
                </div>
                <p className="text-sm text-gray-600 text-center">
                  We sent a 6-digit code to <strong>{email}</strong>
                </p>
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">OTP Code</label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="------"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>
              </form>
            )}

            {/* Step 3: New Password */}
            {step === 'reset' && (
              <form onSubmit={handleResetSubmit} className="space-y-5">
                <div className="flex justify-center mb-2">
                  <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                    <ShieldCheck className="text-blue-600" size={28} />
                  </div>
                </div>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Min 8 chars, upper + lower + digit + special"
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <p className={newPassword.length >= 8 ? 'text-green-600' : ''}>At least 8 characters</p>
                  <p className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>One uppercase letter</p>
                  <p className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>One lowercase letter</p>
                  <p className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>One digit</p>
                  <p className={/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword) ? 'text-green-600' : ''}>One special character</p>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}

            {/* Step 4: Success */}
            {step === 'success' && (
              <div className="text-center space-y-5">
                <div className="flex justify-center">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="text-green-600" size={28} />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Password Reset Successfully</h3>
                  <p className="text-sm text-gray-600 mt-1">You can now log in with your new password.</p>
                </div>
                <button
                  onClick={() => router.push('/admin/login')}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            )}

            {/* Back to Login link */}
            {step !== 'success' && (
              <div className="mt-6 text-center">
                <Link href="/admin/login" className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                  <ArrowLeft size={14} />
                  Back to Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
