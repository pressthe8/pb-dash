import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { FirebaseService } from '../services/firebaseService';
import { DataCacheService } from '../services/dataCacheService';
import { StoredResult } from '../types/concept2';
import { SportType, SPORT_MAPPING } from '../types/personalRecords';
import { PersonalBestsTableView } from '../components/PersonalBestsTableView';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { 
  Activity, 
  Clock, 
  MapPin, 
  TrendingUp, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Rows as RowingBoat,
  Bike,
  Mountain
} from 'lucide-react';
import { formatTime } from '../utils/timeFormatting';

interface DashboardStats {
  totalWorkouts: number;
  totalDistance: number;
  totalTime: number;
  averageDistance: number;
}

export const DashboardPage: React.FC = () => {
  const { user, syncNewResults, connectionExpired, clearConnectionExpired, syncStatus } = useAuth();
  const { prStats, loading: prLoading, error: prError, getPREvents } = usePersonalRecords();
  
  // State management
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkouts: 0,
    totalDistance: 0,
    totalTime: 0,
    averageDistance: 0
  });
  const [recentResults, setRecentResults] = useState<StoredResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [allPREvents, setAllPREvents] = useState<any[]>([]);
  
  // Sport filtering state
  const [selectedSport, setSelectedSport] = useState<SportType>('rower');
  const [availableSports, setAvailableSports] = useState<SportType[]>(['rower']);
  
  // Services
  const firebaseService = FirebaseService.getInstance();
  const cacheService = DataCacheService.getInstance();

  // Get sport icon
  const getSportIcon = (sport: SportType) => {
    switch (sport) {
      case 'rower':
        return <RowingBoat className="w-5 h-5" />;
      case 'bike':
        return <Bike className="w-5 h-5" />;
      case 'skierg':
        return <Mountain className="w-5 h-5" />;
      default:
        return <RowingBoat className="w-5 h-5" />;
    }
  };

  // Load dashboard data
  const loadDashboardData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      setError(null);

      // Try to get cached data first
      const cachedStats = await cacheService.getCachedData<DashboardStats>(user.uid, 'dashboardStats');
      const cachedResults = await cacheService.getCachedData<StoredResult[]>(user.uid, 'allResults');

      if (cachedStats && cachedResults) {
        console.log('Using cached dashboard data');
        setStats(cachedStats);
        setRecentResults(cachedResults.slice(0, 10));
        
        // Determine available sports and set default
        const sports = getAvailableSports(cachedResults);
        setAvailableSports(sports);
        
        // Set default sport from session storage or profile
        const sessionSport = sessionStorage.getItem('dashboard_selected_sport') as SportType;
        if (sessionSport && sports.includes(sessionSport)) {
          setSelectedSport(sessionSport);
        } else {
          const defaultSport = getDefaultSport(cachedResults, sports);
          setSelectedSport(defaultSport);
          sessionStorage.setItem('dashboard_selected_sport', defaultSport);
        }
        
        setLoading(false);
        return;
      }

      // Load fresh data
      console.log('Loading fresh dashboard data');
      const allResults = await firebaseService.getAllResults(user.uid);
      
      // Calculate stats
      const calculatedStats = calculateStats(allResults);
      setStats(calculatedStats);
      setRecentResults(allResults.slice(0, 10));
      
      // Determine available sports and set default
      const sports = getAvailableSports(allResults);
      setAvailableSports(sports);
      
      // Set default sport
      const sessionSport = sessionStorage.getItem('dashboard_selected_sport') as SportType;
      if (sessionSport && sports.includes(sessionSport)) {
        setSelectedSport(sessionSport);
      } else {
        const defaultSport = getDefaultSport(allResults, sports);
        setSelectedSport(defaultSport);
        sessionStorage.setItem('dashboard_selected_sport', defaultSport);
      }

      // Cache the data
      await cacheService.setCachedData(user.uid, 'dashboardStats', calculatedStats);
      await cacheService.setCachedData(user.uid, 'allResults', allResults);

    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Load PR events
  const loadPREvents = async () => {
    if (!user?.uid) return;

    try {
      const events = await getPREvents();
      setAllPREvents(events);
    } catch (err) {
      console.error('Error loading PR events:', err);
    }
  };

  // Calculate stats from results
  const calculateStats = (results: StoredResult[]): DashboardStats => {
    if (results.length === 0) {
      return { totalWorkouts: 0, totalDistance: 0, totalTime: 0, averageDistance: 0 };
    }

    const totalDistance = results.reduce((sum, result) => sum + result.distance, 0);
    const totalTime = results.reduce((sum, result) => sum + result.time, 0);
    const averageDistance = totalDistance / results.length;

    return {
      totalWorkouts: results.length,
      totalDistance,
      totalTime,
      averageDistance
    };
  };

  // Get available sports from results
  const getAvailableSports = (results: StoredResult[]): SportType[] => {
    const sportsSet = new Set<SportType>();
    results.forEach(result => {
      if (result.type === 'rower' || result.type === 'bike' || result.type === 'skierg') {
        sportsSet.add(result.type);
      }
    });
    return Array.from(sportsSet).sort();
  };

  // Get default sport (sport with most results)
  const getDefaultSport = (results: StoredResult[], availableSports: SportType[]): SportType => {
    if (availableSports.length === 0) return 'rower';
    
    const sportCounts = availableSports.map(sport => ({
      sport,
      count: results.filter(r => r.type === sport).length
    }));
    
    sportCounts.sort((a, b) => b.count - a.count);
    return sportCounts[0].sport;
  };

  // Filter data by selected sport
  const filteredStats = useMemo(() => {
    if (!user?.uid) return stats;
    
    // This would need to be recalculated from filtered results
    // For now, return the cached stats (we'll implement proper filtering later)
    return stats;
  }, [stats, selectedSport, user?.uid]);

  const filteredPRStats = useMemo(() => {
    return prStats.filter(stat => {
      // Filter based on sport from PR events
      const hasMatchingSport = allPREvents.some(event => 
        event.activity_key === stat.activity_key && 
        event.sport === selectedSport
      );
      return hasMatchingSport;
    });
  }, [prStats, allPREvents, selectedSport]);

  const filteredPREvents = useMemo(() => {
    return allPREvents.filter(event => event.sport === selectedSport);
  }, [allPREvents, selectedSport]);

  // Handle sport selection
  const handleSportChange = (sport: SportType) => {
    setSelectedSport(sport);
    sessionStorage.setItem('dashboard_selected_sport', sport);
  };

  // Handle sync
  const handleSync = async () => {
    try {
      setSyncError(null);
      const newResultsCount = await syncNewResults();
      
      if (newResultsCount > 0) {
        // Reload dashboard data after successful sync
        await loadDashboardData();
        await loadPREvents();
      }
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  // Handle connection expired
  const handleReconnect = () => {
    clearConnectionExpired();
    // Redirect to Concept2 OAuth
    window.location.href = '/auth/concept2';
  };

  // Load data on mount and user change
  useEffect(() => {
    if (user?.uid) {
      loadDashboardData();
      loadPREvents();
    }
  }, [user?.uid]);

  // Format distance for display
  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${meters}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Connection Expired Alert */}
      {connectionExpired && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-amber-800">
                Concept2 Connection Expired
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                Your Concept2 connection has expired. Please reconnect to sync new data.
              </p>
            </div>
            <button
              onClick={handleReconnect}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors duration-200"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}

      {/* Sync Error Alert */}
      {syncError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">Sync Error</h3>
              <p className="text-sm text-red-700 mt-1">{syncError}</p>
            </div>
            <button
              onClick={() => setSyncError(null)}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Sport Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['rower', 'bike', 'skierg'] as SportType[]).map((sport) => {
            const isAvailable = availableSports.includes(sport);
            const isSelected = selectedSport === sport;
            
            return (
              <button
                key={sport}
                onClick={() => isAvailable && handleSportChange(sport)}
                disabled={!isAvailable}
                className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                  isSelected && isAvailable
                    ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-md'
                    : isAvailable
                    ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center space-x-3">
                  <div className={`p-2 rounded-lg ${
                    isSelected && isAvailable
                      ? 'bg-blue-500 text-white'
                      : isAvailable
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-slate-200 text-slate-400'
                  }`}>
                    {getSportIcon(sport)}
                  </div>
                  <div className="text-left">
                    <div className={`font-semibold ${
                      isSelected && isAvailable
                        ? 'text-blue-900'
                        : isAvailable
                        ? 'text-slate-900'
                        : 'text-slate-400'
                    }`}>
                      {SPORT_MAPPING[sport]}
                    </div>
                    <div className={`text-sm ${
                      isSelected && isAvailable
                        ? 'text-blue-700'
                        : isAvailable
                        ? 'text-slate-600'
                        : 'text-slate-400'
                    }`}>
                      {isAvailable ? 'Available' : 'No data'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Workouts</p>
              <p className="text-2xl font-bold text-slate-900">{filteredStats.totalWorkouts.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <MapPin className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Distance</p>
              <p className="text-2xl font-bold text-slate-900">{formatDistance(filteredStats.totalDistance)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Time</p>
              <p className="text-2xl font-bold text-slate-900">{formatTime(filteredStats.totalTime)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Average Distance</p>
              <p className="text-2xl font-bold text-slate-900">{formatDistance(Math.round(filteredStats.averageDistance))}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Recent Activity</h2>
        <button
          onClick={handleSync}
          disabled={syncStatus !== 'idle'}
          className="flex items-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          <RefreshCw className={`w-4 h-4 ${syncStatus !== 'idle' ? 'animate-spin' : ''}`} />
          <span>
            {syncStatus === 'syncing' ? 'Syncing...' : 
             syncStatus === 'processing' ? 'Processing...' : 
             'Sync New Data'}
          </span>
        </button>
      </div>

      {/* Recent Results */}
      {recentResults.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Latest Workouts</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentResults.slice(0, 5).map((result) => (
                <div key={result.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Activity className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {formatDistance(result.distance)} • {formatTime(result.time)}
                      </p>
                      <p className="text-sm text-slate-600">
                        {new Date(result.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600 capitalize">{result.type}</p>
                    <p className="text-sm text-slate-500">{result.workout_type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <Activity className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No Recent Workouts</h3>
          <p className="text-slate-600">
            Your recent {SPORT_MAPPING[selectedSport].toLowerCase()} workouts will appear here.
          </p>
        </div>
      )}

      {/* Personal Bests Table */}
      <PersonalBestsTableView 
        prStats={filteredPRStats}
        loading={prLoading}
        allPREvents={filteredPREvents}
        selectedSport={selectedSport}
      />

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};