import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BoltBadge } from '../components/BoltBadge';
import { FlamingStopwatchLogo } from '../components/FlamingStopwatchLogo';

type AuthMode = 'signin' | 'signup';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  
  // Form state
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (authMode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      
      // Handle Firebase auth errors with user-friendly messages
      switch (error.code) {
        case 'auth/user-not-found':
          setError('No account found with this email address');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password');
          break;
        case 'auth/email-already-in-use':
          setError('An account with this email already exists');
          break;
        case 'auth/weak-password':
          setError('Password should be at least 6 characters');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later');
          break;
        default:
          setError(error.message || 'Authentication failed. Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      setError('Google sign-in failed. Please try again');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setError('');
    
    try {
      await resetPassword(email);
      setResetEmailSent(true);
    } catch (error: any) {
      console.error('Password reset error:', error);
      switch (error.code) {
        case 'auth/user-not-found':
          setError('No account found with this email address');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address');
          break;
        default:
          setError('Failed to send reset email. Please try again');
      }
    }
  };

  const toggleAuthMode = () => {
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
    setError('');
    setResetEmailSent(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      {/* Bolt.new Badge */}
      <BoltBadge />
      
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-white/10 rounded-full mb-6">
            <FlamingStopwatchLogo size="xl" className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">PB Dash</h1>
          <p className="text-blue-100">Track your Concept2 personal bests</p>
        </div>

        {/* Main Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/20">
          {/* Auth Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => setAuthMode('signin')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                authMode === 'signin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                authMode === 'signup'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Reset Email Confirmation */}
          {resetEmailSent && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                Password reset email sent! Check your inbox and follow the instructions to reset your password.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                  disabled={loading || googleLoading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                  disabled={loading || googleLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  disabled={loading || googleLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password Link */}
            {authMode === 'signin' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-600 hover:text-blue-800 transition-colors duration-200"
                  disabled={loading || googleLoading}
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || googleLoading || !email || !password}
              className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
            >
              {loading ? (
                <LoadingSpinner size="sm" className="text-white" />
              ) : (
                authMode === 'signin' ? 'Sign In' : 'Sign Up'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-4 text-sm text-gray-500">Or continue with</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading}
            className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-3 px-4 rounded-lg hover:bg-gray-50 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-3"
          >
            {googleLoading ? (
              <LoadingSpinner size="sm" className="text-gray-700" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-blue-200 text-sm flex flex-wrap items-center justify-center gap-1">
            <span>Powered by</span>
            <a 
              href="https://www.concept2.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-white transition-colors duration-200"
            >
              Concept2
            </a>
            <span>Logbook API • Built with</span>
            <a 
              href="https://bolt.new/?rid=s5l96i" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-white transition-colors duration-200"
            >
              bolt.new
            </a>
            <span>• A</span>
            <a 
              href="https://pressthe8.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-white transition-colors duration-200"
            >
              Pressthe8
            </a>
            <span>project</span>
          </p>
        </div>
      </div>
    </div>
  );
};