import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BoltBadge } from './BoltBadge';
import { FlamingStopwatchLogo } from './FlamingStopwatchLogo';

export const Layout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleProfileClick = () => {
    navigate('/profile');
  };

  const handleLogoClick = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Bolt.new Badge */}
      <BoltBadge />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Clickable Logo and Title */}
            <button
              onClick={handleLogoClick}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity duration-200"
            >
              <div className="p-2 bg-gradient-to-r from-blue-500 to-teal-500 rounded-lg">
                <FlamingStopwatchLogo size="md" className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">PB Dash</h1>
              </div>
            </button>
            
            {/* User Profile - Clickable */}
            <button
              onClick={handleProfileClick}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-200 hover:bg-slate-100"
            >
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
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-slate-900">
                  {user?.displayName || 'User'}
                </p>
                <p className="text-xs text-slate-500">
                  {user?.email}
                </p>
              </div>
            </button>
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
            <p className="flex flex-wrap items-center justify-center gap-1">
              <span>Powered by</span>
              <a 
                href="https://www.concept2.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
              >
                Concept2
              </a>
              <span>Logbook API • Built with</span>
              <a 
                href="https://bolt.new/?rid=s5l96i" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
              >
                bolt.new
              </a>
              <span>• A</span>
              <a 
                href="https://pressthe8.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
              >
                Pressthe8
              </a>
              <span>project</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};