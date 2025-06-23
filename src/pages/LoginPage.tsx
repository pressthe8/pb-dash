import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Database, ArrowRight, Shield, TrendingUp, Share } from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';

export const LoginPage: React.FC = () => {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signIn();
    } catch (error) {
      console.error('Sign in failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-700 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-4 bg-white/10 rounded-2xl mb-6">
            <Database className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            PB Dash
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Connect your Concept2 account and unlock powerful insights into your rowing performance. 
            Track progress, analyze trends, and achieve your fitness goals.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Features */}
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="p-2 bg-white/10 rounded-lg">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Secure Data Storage</h3>
                <p className="text-blue-100">Your data is private and secure. We can only read your public logbook data.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="p-2 bg-white/10 rounded-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Performance Analytics</h3>
                <p className="text-blue-100">Visualize your progress with detailed charts and performance metrics.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="p-2 bg-white/10 rounded-lg">
                <Share className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Share Your Stats</h3>
                <p className="text-blue-100">Download or export custom graphics to your success.</p>
              </div>
            </div>
          </div>

          {/* Sign In Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Log in / Sign Up with Google</h2>
            <p className="text-blue-100 mb-8">
              Connect your Google account to access your PB Dash account
            </p>
            
            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full bg-white text-slate-900 font-semibold py-4 px-6 rounded-xl 
                       hover:bg-gray-50 transition-all duration-200 transform hover:scale-105
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                       flex items-center justify-center space-x-3 shadow-lg"
            >
              {loading ? (
                <LoadingSpinner size="sm" className="text-slate-900" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>

        <div className="text-center">
          <p className="text-blue-200 text-sm">
            Powered by Concept2 Logbook API • Built with React & Firebase
          </p>
        </div>
      </div>
    </div>
  );
};