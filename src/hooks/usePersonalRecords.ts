import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { PersonalRecordsService } from '../services/personalRecordsService';
import { DataCacheService } from '../services/dataCacheService';
import { PRStats, PREvent } from '../types/personalRecords';

export const usePersonalRecords = () => {
  const { user } = useAuth();
  const [prStats, setPRStats] = useState<PRStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  
  // Reason: Prevent duplicate loading in React strict mode
  const hasLoaded = useRef(false);

  const prService = PersonalRecordsService.getInstance();
  const cacheService = DataCacheService.getInstance();

  // Reason: Memoize loadPRData to prevent unnecessary recreations
  const loadPRData = useCallback(async () => {
    // Reason: Defensive check to ensure user and user.uid are both defined
    if (!user || !user.uid) {
      console.warn('loadPRData called without valid user or user.uid');
      return;
    }
    
    // Reason: Capture userId in local variable to prevent race conditions
    const userId = user.uid;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading PR data for user:', userId);
      
      // Reason: Try to get cached data first for instant response
      const cachedStats = await cacheService.getCachedData<PRStats[]>(userId, 'prStats');
      if (cachedStats) {
        console.log('Using cached PR stats');
        setPRStats(cachedStats);
        setLoading(false);
        return;
      }
      
      // Reason: Load fresh data if not cached
      console.log('Loading fresh PR stats from database');
      const stats = await prService.getPRStats(userId);
      
      // Reason: Cache the loaded data for future use
      await cacheService.setCachedData(userId, 'prStats', stats);
      
      setPRStats(stats);
      
      console.log(`PR data loaded and cached: ${stats.length} stats`);
    } catch (err) {
      console.error('Error loading PR data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load personal records');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, prService, cacheService]);

  // Reason: Fixed useEffect to prevent circular dependency with lastUserId
  useEffect(() => {
    // Reset loading state when user changes or is null
    if (!user?.uid) {
      hasLoaded.current = false;
      setLastUserId(null);
      setLoading(false);
      setPRStats([]);
      return;
    }
    
    // Only load if user changed or hasn't loaded yet
    // Reason: Check lastUserId inside effect but don't put it in dependency array
    if (!hasLoaded.current || lastUserId !== user.uid) {
      hasLoaded.current = true;
      setLastUserId(user.uid);
      loadPRData();
    }
  }, [user?.uid, loadPRData]); // Reason: Only depend on user.uid and memoized loadPRData

  const processNewResultsAndRecalculate = useCallback(async () => {
    // Reason: Defensive check to ensure user and user.uid are both defined
    if (!user || !user.uid) {
      console.warn('processNewResultsAndRecalculate called without valid user or user.uid');
      return;
    }
    
    // Reason: Capture userId in local variable to prevent race conditions
    const userId = user.uid;
    
    try {
      setError(null);
      console.log('Starting smart PR processing and recalculation');
      await prService.processNewResultsAndRecalculate(userId);
      
      // Reason: Invalidate cache after PR recalculation
      await cacheService.invalidateCache(userId, 'prStats');
      await cacheService.invalidateCache(userId, 'prEvents');
      
      await loadPRData(); // Reload data after processing
      console.log('Smart PR processing and recalculation completed');
    } catch (err) {
      console.error('Error in smart PR processing and recalculation:', err);
      setError(err instanceof Error ? err.message : 'Failed to process new results and recalculate personal records');
    }
  }, [user?.uid, prService, cacheService, loadPRData]);

  const getPREvents = useCallback(async (): Promise<PREvent[]> => {
    // Reason: Defensive check to ensure user and user.uid are both defined
    if (!user || !user.uid) {
      console.warn('getPREvents called without valid user or user.uid');
      return [];
    }
    
    // Reason: Capture userId in local variable to prevent race conditions
    const userId = user.uid;
    
    try {
      // Reason: Try to get cached data first for instant response
      const cachedEvents = await cacheService.getCachedData<PREvent[]>(userId, 'prEvents');
      if (cachedEvents) {
        console.log('Using cached PR events');
        return cachedEvents;
      }
      
      // Reason: Load fresh data if not cached
      console.log('Loading fresh PR events from database');
      const events = await prService.getPREvents(userId);
      
      // Reason: Cache the loaded data for future use
      await cacheService.setCachedData(userId, 'prEvents', events);
      
      return events;
    } catch (err) {
      console.error('Error getting PR events:', err);
      return [];
    }
  }, [user?.uid, prService, cacheService]);

  return {
    prStats,
    loading,
    error,
    loadPRData,
    processNewResultsAndRecalculate,
    getPREvents
  };
};