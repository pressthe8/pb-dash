import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Activity, LogOut, User, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BoltBadge } from './BoltBadge';
import { FlamingStopwatchLogo } from './FlamingStopwatchLogo';

export const Layout: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Bolt.new Badge */}
      <BoltBadge />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-teal-500 rounded-lg">
                <FlamingStopwatchLogo size="md" className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">PB Dash</h1>
              </div>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <Link
                to="/dashboard"
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-200 ${
                  isActive('/dashboard')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
              
              <Link
                to="/profile"
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-200 ${
                  isActive('/profile')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm font-medium">Profile</span>
              </Link>
            </nav>
            
            {/* User Menu */}
            <div className="flex items-center space-x-3 pl-4 border-l border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-teal-500 rounded-full flex items-center justify-center">
                  {user?.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">
                    {user?.displayName || 'User'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {user?.email}
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleSignOut}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors duration-200"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-4 py-2">
              <Link
                to="/dashboard"
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-200 ${
                  isActive('/dashboard')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
              
              <Link
                to="/profile"
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-200 ${
                  isActive('/profile')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm font-medium">Profile</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white/50 border-t border-slate-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-slate-500 text-sm">
            <p>Powered by Concept2 Logbook API • Built with React & Firebase</p>
          </div>
        </div>
      </footer>
    </div>
  );
};