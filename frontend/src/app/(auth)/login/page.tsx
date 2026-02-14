'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

// Google Identity Services types (separate from Google Maps)
interface GoogleIdentityConfig {
  client_id: string;
  callback: (response: { credential: string }) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleIdentityButtonConfig {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: GoogleIdentityConfig) => void;
      prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
      renderButton: (element: HTMLElement, config: GoogleIdentityButtonConfig) => void;
    };
  };
}

// Helper to safely get Google Identity Services (doesn't conflict with Maps)
function getGoogleIdentity(): GoogleIdentityServices | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  if (google?.accounts?.id) {
    return google as GoogleIdentityServices;
  }
  return null;
}

// JWT decode helper
function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, setAuth, _hasHydrated } = useAuthStore();

  const [loginMethod, setLoginMethod] = useState<'otp' | 'password'>('otp');
  const [step, setStep] = useState<'phone' | 'otp' | 'register' | 'register_otp'>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoaded, setGoogleLoaded] = useState(false);
  
  // Registration fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');

  // Google OAuth Client ID from environment
  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  // Handle Google Sign In response
  const handleGoogleResponse = useCallback(async (response: { credential: string }) => {
    setLoading(true);
    setError('');
    
    try {
      // Decode the JWT to get user info
      const payload = parseJwt(response.credential);
      
      if (!payload) {
        setError('Failed to parse Google response');
        setLoading(false);
        return;
      }

      // Call our backend with Google token
      const result = await api.auth.socialLogin({
        token: response.credential,
        unique_id: payload.sub,
        email: payload.email,
        medium: 'google'
      });

      const data = result.data;

      if (data.token && data.user) {
        console.log('✅ Google login successful');
        setAuth(data.user, data.token);
        router.push('/chat');
      } else if (data.is_personal_info === 0) {
        // User needs to complete profile (add phone number)
        setEmail(payload.email);
        setFirstName(payload.given_name || '');
        setLastName(payload.family_name || '');
        setStep('register');
        setError('Please complete your profile with a phone number');
        setLoading(false);
      } else {
        setError('Login failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Google login failed:', err);
      setError('Google login failed. Please try again or use OTP.');
      setLoading(false);
    }
  }, [router, setAuth]);

  // Initialize Google Sign In
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    
    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const google = getGoogleIdentity();
      if (google) {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        setGoogleLoaded(true);
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [GOOGLE_CLIENT_ID, handleGoogleResponse]);

  // Render Google button after load
  useEffect(() => {
    const google = getGoogleIdentity();
    if (googleLoaded && google && step === 'phone') {
      const buttonContainer = document.getElementById('google-signin-button');
      if (buttonContainer) {
        buttonContainer.innerHTML = '';
        google.accounts.id.renderButton(buttonContainer, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        });
      }
    }
  }, [googleLoaded, step]);

  // Redirect if already authenticated
  useEffect(() => {
    if (_hasHydrated && isAuthenticated) {
      router.push('/chat');
    }
  }, [isAuthenticated, _hasHydrated, router]);

  // Don't render until hydrated to avoid flash
  if (!_hasHydrated) {
    return null;
  }

  // Already authenticated, redirecting
  if (isAuthenticated) {
    return null;
  }

  type ApiError = {
    response?: {
      data?: {
        message?: string;
      };
    };
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (typeof err === 'object' && err !== null) {
      const apiError = err as ApiError;
      return apiError.response?.data?.message ?? fallback;
    }
    return fallback;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate phone number
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        setError('Please enter a valid 10-digit Indian mobile number');
        setLoading(false);
        return;
      }

      await api.auth.sendOtp(phone);
      setStep('otp');
      setLoading(false);
    } catch (err: unknown) {
      console.error('Failed to send OTP:', err);
      setError(
        getErrorMessage(
          err,
          'Failed to send OTP. Please try again.'
        )
      );
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate OTP
      if (otp.length !== 6) {
        setError('Please enter a valid 6-digit OTP');
        setLoading(false);
        return;
      }

      const response = await api.auth.verifyOtp(phone, otp);
      const data = response.data;

      if (!data.success) {
        setError(data.message || 'Invalid OTP');
        setLoading(false);
        return;
      }

      // Check if user needs to complete registration
      if (data.is_personal_info === 0) {
        console.log('⚠️ New user - needs to complete registration');
        setStep('register');
        setLoading(false);
        return;
      }

      // Existing user - login successful
      if (data.token && data.user) {
        console.log('✅ Existing user - login successful');
        setAuth(data.user, data.token);
        router.push('/chat');
      } else {
        setError('Login failed. Please try again.');
        setLoading(false);
      }
    } catch (err: unknown) {
      console.error('Failed to verify OTP:', err);
      setError(
        getErrorMessage(
          err,
          'Invalid OTP. Please try again.'
        )
      );
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate phone number
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        setError('Please enter a valid 10-digit Indian mobile number');
        setLoading(false);
        return;
      }

      if (!password) {
        setError('Please enter your password');
        setLoading(false);
        return;
      }

      const response = await api.auth.login({ phone, password });
      const data = response.data;

      if (data.token && data.user) {
        console.log('✅ Login successful');
        setAuth(data.user, data.token);
        router.push('/chat');
      } else {
        setError('Login failed. Please check your credentials.');
        setLoading(false);
      }
    } catch (err: unknown) {
      console.error('Failed to login:', err);
      setError(
        getErrorMessage(
          err,
          'Login failed. Please check your credentials.'
        )
      );
      setLoading(false);
    }
  };

  // Step 1 of registration: Validate phone and send OTP
  const handleRegisterSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate fields
      if (!firstName.trim()) {
        setError('Please enter your first name');
        setLoading(false);
        return;
      }

      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      // Validate phone number
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(registerPhone)) {
        setError('Please enter a valid 10-digit Indian mobile number');
        setLoading(false);
        return;
      }

      // Send OTP to the phone number for verification
      await api.auth.sendOtp(registerPhone);
      setPhone(registerPhone); // Store for OTP verification
      setOtp(''); // Clear any previous OTP
      setStep('register_otp');
      setLoading(false);
    } catch (err: unknown) {
      console.error('Failed to send OTP:', err);
      setError(
        getErrorMessage(
          err,
          'Failed to send OTP. Please try again.'
        )
      );
      setLoading(false);
    }
  };

  // Step 2 of registration: Verify OTP and complete registration
  const handleRegisterVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (otp.length !== 6) {
        setError('Please enter a valid 6-digit OTP');
        setLoading(false);
        return;
      }

      // Verify OTP - this creates/logs in the PHP user
      const verifyResponse = await api.auth.verifyOtp(registerPhone, otp);
      const verifyData = verifyResponse.data;

      if (!verifyData.success) {
        setError(verifyData.message || 'Invalid OTP');
        setLoading(false);
        return;
      }

      // OTP verified! Now complete profile with name + email
      if (verifyData.token && verifyData.user) {
        // User already existed in PHP - update their profile with Google info
        try {
          await api.auth.updateUserInfo({
            phone: registerPhone,
            f_name: firstName,
            l_name: lastName || '',
            email
          });
        } catch {
          // Non-critical: profile update failed, but auth succeeded
          console.warn('Profile update failed, but auth succeeded');
        }

        console.log('✅ Registration complete via OTP + profile update');
        // Merge user data with Google info
        const user = {
          ...verifyData.user,
          f_name: firstName || verifyData.user.f_name,
          l_name: lastName || verifyData.user.l_name || '',
          email: email || verifyData.user.email || '',
        };
        setAuth(user, verifyData.token);
        router.push('/chat');
      } else if (verifyData.is_personal_info === 0) {
        // New user created by OTP - complete with update-info
        try {
          const updateResponse = await api.auth.updateUserInfo({
            phone: registerPhone,
            f_name: firstName,
            l_name: lastName || '',
            email
          });
          const updateData = updateResponse.data;

          if (updateData.token && updateData.user) {
            console.log('✅ New user registered and profile completed');
            setAuth(updateData.user, updateData.token);
            router.push('/chat');
            return;
          }
        } catch {
          console.warn('Profile update after new user creation failed');
        }

        // Fallback: even if update-info fails, the OTP created an account
        setError('Account created! Please login with your phone number.');
        setStep('phone');
        setLoading(false);
      } else {
        setError('Registration failed. Please try again.');
        setLoading(false);
      }
    } catch (err: unknown) {
      console.error('Failed to verify OTP:', err);
      setError(
        getErrorMessage(
          err,
          'Invalid OTP. Please try again.'
        )
      );
      setLoading(false);
    }
  };

  // Legacy handler for non-Google registration (kept for compatibility)
  const handleRegister = async (e: React.FormEvent) => {
    // For Google OAuth users, use the OTP-based registration
    return handleRegisterSendOtp(e);
  };

  const handleBack = () => {
    setStep('phone');
    setOtp('');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Mangwale
          </h1>
          <p className="text-gray-600">
            {step === 'phone' 
              ? 'Login to access delivery services' 
              : step === 'otp'
              ? 'Enter the OTP sent to your phone'
              : step === 'register_otp'
              ? 'Verify your phone number'
              : 'Complete your profile to continue'}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === 'phone' ? (
            <>
              {/* Google Sign-In Button - ChatGPT Style at Top */}
              {GOOGLE_CLIENT_ID && (
                <div className="mb-6">
                  <div id="google-signin-button" className="flex justify-center"></div>
                </div>
              )}

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or continue with phone</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200 mb-6">
                <button
                  className={`flex-1 py-2 text-center font-medium ${
                    loginMethod === 'otp'
                      ? 'text-green-600 border-b-2 border-green-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setLoginMethod('otp')}
                >
                  OTP Login
                </button>
                <button
                  className={`flex-1 py-2 text-center font-medium ${
                    loginMethod === 'password'
                      ? 'text-green-600 border-b-2 border-green-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setLoginMethod('password')}
                >
                  Password
                </button>
              </div>

              <form onSubmit={loginMethod === 'otp' ? handleSendOtp : handlePasswordLogin} className="space-y-6">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                      +91
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      className="w-full pl-14 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                      disabled={loading}
                      autoFocus
                      maxLength={10}
                    />
                  </div>
                </div>

                {loginMethod === 'password' && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                      disabled={loading}
                    />
                    <div className="mt-2 text-right">
                      <button type="button" className="text-sm text-green-600 hover:text-green-700">
                        Forgot Password?
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || phone.length !== 10 || (loginMethod === 'password' && !password)}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : loginMethod === 'otp' ? 'Send OTP' : 'Login'}
                </button>
              </form>
              
              {/* Users can browse chat without logging in - auth required only for orders/bookings */}
            </>
          ) : step === 'otp' ? (
            // Step 2: OTP Verification
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter OTP
                </label>
                <input
                  id="otp"
                  type="tel"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg text-center tracking-widest"
                  disabled={loading}
                  autoFocus
                  maxLength={6}
                />
                <p className="text-sm text-gray-500 mt-2 text-center">
                  OTP sent to +91 {phone}
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Change Phone Number
                </button>
              </div>

              {/* Resend OTP */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="text-green-600 hover:text-green-700 text-sm font-medium disabled:opacity-50"
                >
                  Resend OTP
                </button>
              </div>
            </form>
          ) : step === 'register' ? (
            // Step 3: Registration (New Users - need phone for PHP account)
            <form onSubmit={handleRegisterSendOtp} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm mb-4">
                Welcome! Please complete your registration to continue.
              </div>

              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name (Optional)
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label htmlFor="registerPhone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number * <span className="text-gray-400 font-normal">(for OTP verification)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                    +91
                  </span>
                  <input
                    id="registerPhone"
                    type="tel"
                    value={registerPhone}
                    onChange={(e) => setRegisterPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="w-full pl-14 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                    disabled={loading}
                    autoFocus
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !firstName.trim() || !email.trim() || registerPhone.length !== 10}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending OTP...' : 'Verify Phone & Register'}
              </button>

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Back to Login
              </button>
            </form>
          ) : step === 'register_otp' ? (
            // Step 4: OTP Verification for Registration
            <form onSubmit={handleRegisterVerifyOtp} className="space-y-6">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
                OTP sent to +91 {registerPhone}. Please verify to complete registration.
              </div>

              <div>
                <label htmlFor="registerOtp" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter OTP
                </label>
                <input
                  id="registerOtp"
                  type="tel"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg text-center tracking-widest"
                  disabled={loading}
                  autoFocus
                  maxLength={6}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Verify & Complete Registration'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('register'); setOtp(''); setError(''); }}
                  disabled={loading}
                  className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Change Phone Number
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await api.auth.sendOtp(registerPhone);
                      setError('');
                      setLoading(false);
                    } catch {
                      setError('Failed to resend OTP');
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="text-green-600 hover:text-green-700 text-sm font-medium disabled:opacity-50"
                >
                  Resend OTP
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
