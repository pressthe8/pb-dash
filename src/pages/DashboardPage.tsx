import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../config/firebase';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { Concept2ApiService } from '../services/concept2Api';
import { FirebaseService } from '../services/firebaseService';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { DataCacheService } from '../services/dataCacheService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PersonalRecordsCard } from '../components/PersonalRecordsCard';
import { PersonalBestsTableView } from '../components/PersonalBestsTableView';
import { StoredResult } from '../types/concept2';
import { formatTime } from '../utils/timeFormatting';
import { Rows as RowingBoat, TrendingUp, Link, CheckCircle, AlertTriangle, Trophy, Ruler, Clock } from 'lucide-react';

interface DashboardStats {
  totalWorkouts: number;
  totalDistance: number;
  totalTime: number;
  averageDistance: number;
}

export const DashboardPage: React.FC = () => {
  const { 
    user, 
    concept2Connected, 
    checkConcept2Connection, 
    clearConcept2Connection,
    connectionExpired,
    clearConnectionExpired,
    syncStatus
  } = useAuth();
  const { prStats, loading: prLoading, error: prError, loadPRData, processNewResultsAndRecalculate, getPREvents } = usePersonalRecords();
  const [allResults, setAllResults] = useState<StoredResult[]>([]);
  const [allPREvents, setAllPREvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkouts: 0,
    totalDistance: 0,
    totalTime: 0,
    averageDistance: 0
  });

  // DEV ONLY: Toggle between old and new PB views
  const [useNewTableView, setUseNewTableView] = useState(true);

  const concept2Api = Concept2ApiService.getInstance();
  const firebaseService = FirebaseService.getInstance();
  const cloudFunctions = CloudFunctionsService.getInstance();
  const cacheService = DataCacheService.getInstance();

  // Reason: Memoize calculateStats to prevent unnecessary recreations
  const calculateStats = useCallback((results: StoredResult[]): DashboardStats => {
    const totalWorkouts = results.length;
    const totalDistance = results.reduce((sum, result) => sum + result.distance, 0);
    const totalTime = results.reduce((sum, result) => sum + result.time, 0);
    const averageDistance = totalWorkouts > 0 ? totalDistance / totalWorkouts : 0;

    return {
      totalWorkouts,
      totalDistance,
      totalTime,
      averageDistance
    };
  }, []);

  // Reason: Memoize loadDashboardData to prevent unnecessary recreations
  const loadDashboardData = useCallback(async () => {
    if (!user?.uid) {
      console.warn('loadDashboardData called without valid user');
      return;
    }

    try {
      setLoading(true);
      console.log('Loading dashboard data for connected user');
      
      // Reason: Try to get cached data first for instant response
      const cachedResults = await cacheService.getCachedData<StoredResult[]>(user.uid, 'allResults');
      const cachedStats = await cacheService.getCachedData<DashboardStats>(user.uid, 'dashboardStats');
      
      if (cachedResults && cachedStats) {
        console.log('Using cached dashboard data');
        setAllResults(cachedResults);
        setStats(cachedStats);
        
        // Load PR events (might be cached too)
        const prEvents = await getPREvents();
        setAllPREvents(prEvents);
        
        setLoading(false);
        return;
      }
      
      // Reason: Load fresh data if not cached
      console.log('Loading fresh dashboard data from database');
      
      // Load all results once and derive everything from that
      const results = await firebaseService.getAllResults(user.uid);
      setAllResults(results);
      
      // Cache the results for future use
      await cacheService.setCachedData(user.uid, 'allResults', results);
      
      // Calculate and cache stats
      const calculatedStats = calculateStats(results);
      setStats(calculatedStats);
      await cacheService.setCachedData(user.uid, 'dashboardStats', calculatedStats);
      
      // Load all PR events for the enhanced filtering
      const prEvents = await getPREvents();
      setAllPREvents(prEvents);
      
      console.log(`Dashboard data loaded and cached: ${results.length} total results, ${prEvents.length} PR events`);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Don't show error to user, just log it
    } finally {
      setLoading(false);
    }
  }, [user?.uid, firebaseService, cacheService, calculateStats, getPREvents]);

  // Reason: Fixed useEffect to prevent circular dependency with hasLoadedData
  useEffect(() => {
    // Exit early if conditions aren't met or if we've already loaded
    if (!user || !concept2Connected || hasLoadedData) {
      // Reset state when user or connection changes
      if (!user || !concept2Connected) {
        setHasLoadedData(false);
        setLoading(false);
      }
      return;
    }
    
    console.log('User authenticated and Concept2 connected, loading dashboard data');
    setHasLoadedData(true);
    loadDashboardData();
  }, [user, concept2Connected, loadDashboardData]); // Reason: Remove hasLoadedData from dependencies

  // Reason: Restore cache when component mounts
  useEffect(() => {
    if (user?.uid) {
      cacheService.restoreFromSessionStorage(user.uid);
    }
  }, [user?.uid, cacheService]);

  const handleConnectConcept2 = () => {
    console.log('Starting Concept2 OAuth flow');
    // Clear the connection expired flag when user initiates reconnection
    clearConnectionExpired();
    
    try {
      const authUrl = concept2Api.generateAuthUrl();
      console.log('Generated OAuth URL, redirecting to Concept2');
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error generating OAuth URL:', error);
      // Don't show technical error to user
    }
  };

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${meters}m`;
  };

  // Reason: Show loading state only when we're actually loading data for a connected user
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!concept2Connected) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-teal-500 rounded-full 
                         flex items-center justify-center mx-auto mb-6">
            <Link className="w-8 h-8 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            {connectionExpired ? 'Reconnect Your Concept2 Account' : 'Connect Your Concept2 Account'}
          </h2>
          
          <p className="text-slate-600 mb-8">
            {connectionExpired 
              ? 'Your Concept2 connection has expired. Please reconnect to continue viewing your rowing data and analytics.'
              : 'To view your rowing data and analytics, you need to connect your Concept2 Logbook account. This allows us to securely fetch your workout history and provide detailed insights.'
            }
          </p>
          
          <button
            onClick={handleConnectConcept2}
            className="bg-gradient-to-r from-blue-500 to-teal-500 text-white font-semibold 
                     py-3 px-8 rounded-xl hover:from-blue-600 hover:to-teal-600 
                     transition-all duration-200 transform hover:scale-105
                     flex items-center space-x-3 mx-auto"
          >
            <RowingBoat className="w-5 h-5" />
            <span>{connectionExpired ? 'Reconnect to Concept2' : 'Connect to Concept2'}</span>
          </button>
          
          <p className="text-sm text-slate-500 mt-4">
            You'll be redirected to Concept2 to authorize the connection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Processing Overlay */}
      {syncStatus !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-2xl border border-slate-200 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mb-6">
                <LoadingSpinner size="lg" className="mx-auto text-blue-500" />
              </div>
              
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {syncStatus === 'syncing' ? 'Syncing Data' : 'Processing Records'}
              </h3>
              
              <p className="text-slate-600">
                {syncStatus === 'syncing' 
                  ? 'Fetching your latest workouts from Concept2...'
                  : 'Analyzing new workouts for personal records...'
                }
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-600 mt-1">Your rowing performance at a glance</p>
          </div>
          
          {/* DEV ONLY: Toggle between views */}
          {import.meta.env.DEV && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-600">PB View:</span>
              <button
                onClick={() => setUseNewTableView(!useNewTableView)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  useNewTableView 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {useNewTableView ? 'Table' : 'Cards'}
              </button>
            </div>
          )}
        </div>

        {/* PR Error Alert */}
        {prError && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-amber-800">Personal Records Error</h3>
                <p className="text-sm text-amber-700 mt-1">{prError}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="text-amber-400 hover:text-amber-600"
              >
                <span className="sr-only">Dismiss</span>
                ×
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards - Updated for mobile 2x2 grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3 lg:mb-4">
              <div className="p-1.5 lg:p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="w-4 h-4 lg:w-6 lg:h-6 text-blue-600" />
              </div>
              <span className="text-lg lg:text-2xl font-bold text-slate-900">{stats.totalWorkouts}</span>
            </div>
            <h3 className="text-xs lg:text-sm font-medium text-slate-600">Total Workouts</h3>
          </div>

          <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3 lg:mb-4">
              <div className="p-1.5 lg:p-2 bg-green-100 rounded-lg">
                <Ruler className="w-4 h-4 lg:w-6 lg:h-6 text-green-600" />
              </div>
              <span className="text-lg lg:text-2xl font-bold text-slate-900">
                {formatDistance(stats.totalDistance)}
              </span>
            </div>
            <h3 className="text-xs lg:text-sm font-medium text-slate-600">Total Distance</h3>
          </div>

          <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3 lg:mb-4">
              <div className="p-1.5 lg:p-2 bg-purple-100 rounded-lg">
                <Clock className="w-4 h-4 lg:w-6 lg:h-6 text-purple-600" />
              </div>
              <span className="text-lg lg:text-2xl font-bold text-slate-900">
                {formatTime(stats.totalTime)}
              </span>
            </div>
            <h3 className="text-xs lg:text-sm font-medium text-slate-600">Total Time</h3>
          </div>

          <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3 lg:mb-4">
              <div className="p-1.5 lg:p-2 bg-orange-100 rounded-lg">
                <RowingBoat className="w-4 h-4 lg:w-6 lg:h-6 text-orange-600" />
              </div>
              <span className="text-lg lg:text-2xl font-bold text-slate-900">
                {formatDistance(Math.round(stats.averageDistance))}
              </span>
            </div>
            <h3 className="text-xs lg:text-sm font-medium text-slate-600">Average Distance</h3>
          </div>
        </div>

        {/* Personal Bests Section - Toggle between old and new views */}
        {useNewTableView ? (
          <PersonalBestsTableView prStats={prStats} loading={prLoading} allPREvents={allPREvents} />
        ) : (
          <PersonalRecordsCard prStats={prStats} loading={prLoading} allPREvents={allPREvents} />
        )}
      </div>
    </>
  );
};