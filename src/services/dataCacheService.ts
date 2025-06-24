import { StoredResult } from '../types/concept2';
import { PRStats, PREvent, UserProfile } from '../types/personalRecords';

// Cache entry interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  userId: string; // Add userId to cache entries to prevent cross-user contamination
}

// Cache configuration
interface CacheConfig {
  defaultTTL: number; // Time to live in milliseconds
  maxEntries: number; // Maximum number of cache entries per user
}

// Data types that can be cached
export type CacheableDataType = 
  | 'allResults'
  | 'prStats' 
  | 'prEvents'
  | 'userProfile'
  | 'dashboardStats';

// Cache data interfaces
export interface CachedData {
  allResults?: StoredResult[];
  prStats?: PRStats[];
  prEvents?: PREvent[];
  userProfile?: UserProfile;
  dashboardStats?: {
    totalWorkouts: number;
    totalDistance: number;
    totalTime: number;
    averageDistance: number;
  };
}

export class DataCacheService {
  private static instance: DataCacheService;
  private cache = new Map<string, Map<CacheableDataType, CacheEntry<any>>>();
  private config: CacheConfig;

  private constructor() {
    this.config = {
      defaultTTL: 30 * 60 * 1000, // 30 minutes default
      maxEntries: 10 // Max 10 different data types per user
    };

    // Reason: Set up periodic cleanup to prevent memory leaks
    this.setupPeriodicCleanup();
  }

  static getInstance(): DataCacheService {
    if (!DataCacheService.instance) {
      DataCacheService.instance = new DataCacheService();
    }
    return DataCacheService.instance;
  }

  /**
   * Get cached data for a user
   * Returns null if cache miss or expired
   */
  async getCachedData<T>(
    userId: string, 
    dataType: CacheableDataType, 
    maxAge?: number
  ): Promise<T | null> {
    try {
      const userCache = this.cache.get(userId);
      if (!userCache) {
        console.log(`Cache miss: No cache found for user ${userId}`);
        return null;
      }

      const entry = userCache.get(dataType);
      if (!entry) {
        console.log(`Cache miss: No ${dataType} data found for user ${userId}`);
        return null;
      }

      // Reason: Verify cache entry belongs to the correct user to prevent cross-user contamination
      if (entry.userId !== userId) {
        console.log(`Cache invalidated: ${dataType} data belongs to different user (expected: ${userId}, found: ${entry.userId})`);
        userCache.delete(dataType);
        return null;
      }

      const now = Date.now();
      const effectiveMaxAge = maxAge || this.config.defaultTTL;
      const isExpired = (now - entry.timestamp) > effectiveMaxAge || now > entry.expiresAt;

      if (isExpired) {
        console.log(`Cache expired: ${dataType} data for user ${userId} (age: ${now - entry.timestamp}ms)`);
        userCache.delete(dataType);
        return null;
      }

      console.log(`Cache hit: ${dataType} data for user ${userId} (age: ${now - entry.timestamp}ms)`);
      return entry.data as T;
    } catch (error) {
      console.error('Error getting cached data:', error);
      return null;
    }
  }

  /**
   * Set cached data for a user
   */
  async setCachedData<T>(
    userId: string, 
    dataType: CacheableDataType, 
    data: T,
    customTTL?: number
  ): Promise<void> {
    try {
      let userCache = this.cache.get(userId);
      if (!userCache) {
        userCache = new Map();
        this.cache.set(userId, userCache);
      }

      // Reason: Enforce max entries limit to prevent memory bloat
      if (userCache.size >= this.config.maxEntries && !userCache.has(dataType)) {
        console.warn(`Cache limit reached for user ${userId}, clearing oldest entries`);
        this.clearOldestEntries(userCache, 2); // Remove 2 oldest entries
      }

      const now = Date.now();
      const ttl = customTTL || this.config.defaultTTL;
      const entry: CacheEntry<T> = {
        data,
        timestamp: now,
        expiresAt: now + ttl,
        userId // Reason: Store userId with cache entry to prevent cross-user contamination
      };

      userCache.set(dataType, entry);
      console.log(`Cache set: ${dataType} data for user ${userId} (TTL: ${ttl}ms)`);

      // Reason: Also store in sessionStorage for persistence across page refreshes
      this.persistToSessionStorage(userId, dataType, entry);
    } catch (error) {
      console.error('Error setting cached data:', error);
    }
  }

  /**
   * Invalidate specific cached data for a user
   */
  async invalidateCache(userId: string, dataType?: CacheableDataType): Promise<void> {
    try {
      const userCache = this.cache.get(userId);
      if (!userCache) {
        console.log(`No cache to invalidate for user ${userId}`);
        return;
      }

      if (dataType) {
        // Invalidate specific data type
        userCache.delete(dataType);
        this.removeFromSessionStorage(userId, dataType);
        console.log(`Cache invalidated: ${dataType} for user ${userId}`);
      } else {
        // Invalidate all data for user
        userCache.clear();
        this.clearSessionStorageForUser(userId);
        console.log(`All cache invalidated for user ${userId}`);
      }
    } catch (error) {
      console.error('Error invalidating cache:', error);
    }
  }

  /**
   * Invalidate all cached data for all users
   * Use when user signs out or major data changes occur
   */
  async invalidateAllCache(): Promise<void> {
    try {
      this.cache.clear();
      this.clearAllSessionStorage();
      console.log('All cache invalidated for all users');
    } catch (error) {
      console.error('Error invalidating all cache:', error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { 
    totalUsers: number; 
    totalEntries: number; 
    userStats: Array<{ userId: string; entries: number; dataTypes: string[] }> 
  } {
    const userStats: Array<{ userId: string; entries: number; dataTypes: string[] }> = [];
    let totalEntries = 0;

    for (const [userId, userCache] of this.cache.entries()) {
      const dataTypes = Array.from(userCache.keys());
      userStats.push({
        userId,
        entries: userCache.size,
        dataTypes
      });
      totalEntries += userCache.size;
    }

    return {
      totalUsers: this.cache.size,
      totalEntries,
      userStats
    };
  }

  /**
   * Check if data is cached and fresh
   */
  isCached(userId: string, dataType: CacheableDataType, maxAge?: number): boolean {
    const userCache = this.cache.get(userId);
    if (!userCache) return false;

    const entry = userCache.get(dataType);
    if (!entry) return false;

    // Reason: Verify cache entry belongs to the correct user
    if (entry.userId !== userId) return false;

    const now = Date.now();
    const effectiveMaxAge = maxAge || this.config.defaultTTL;
    const isExpired = (now - entry.timestamp) > effectiveMaxAge || now > entry.expiresAt;

    return !isExpired;
  }

  /**
   * Preload data into cache (useful for background loading)
   */
  async preloadData<T>(
    userId: string, 
    dataType: CacheableDataType, 
    dataLoader: () => Promise<T>,
    customTTL?: number
  ): Promise<T> {
    try {
      // Check if already cached and fresh
      const cached = await this.getCachedData<T>(userId, dataType);
      if (cached !== null) {
        return cached;
      }

      // Load fresh data
      console.log(`Preloading ${dataType} for user ${userId}`);
      const data = await dataLoader();
      
      // Cache the loaded data
      await this.setCachedData(userId, dataType, data, customTTL);
      
      return data;
    } catch (error) {
      console.error(`Error preloading ${dataType} for user ${userId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  private clearOldestEntries(userCache: Map<CacheableDataType, CacheEntry<any>>, count: number): void {
    const entries = Array.from(userCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by timestamp (oldest first)
    
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      userCache.delete(entries[i][0]);
    }
  }

  private setupPeriodicCleanup(): void {
    // Reason: Clean up expired entries every 5 minutes to prevent memory leaks
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000); // 5 minutes
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, userCache] of this.cache.entries()) {
      const expiredKeys: CacheableDataType[] = [];
      
      for (const [dataType, entry] of userCache.entries()) {
        if (now > entry.expiresAt) {
          expiredKeys.push(dataType);
        }
      }

      expiredKeys.forEach(key => {
        userCache.delete(key);
        cleanedCount++;
      });

      // Remove empty user caches
      if (userCache.size === 0) {
        this.cache.delete(userId);
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cache cleanup: Removed ${cleanedCount} expired entries`);
    }
  }

  // SessionStorage persistence methods

  private getSessionStorageKey(userId: string, dataType: CacheableDataType): string {
    return `cache_${userId}_${dataType}`;
  }

  private persistToSessionStorage<T>(userId: string, dataType: CacheableDataType, entry: CacheEntry<T>): void {
    try {
      const key = this.getSessionStorageKey(userId, dataType);
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      // Reason: SessionStorage might be full or unavailable, don't fail the cache operation
      console.warn('Failed to persist to sessionStorage:', error);
    }
  }

  private removeFromSessionStorage(userId: string, dataType: CacheableDataType): void {
    try {
      const key = this.getSessionStorageKey(userId, dataType);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from sessionStorage:', error);
    }
  }

  private clearSessionStorageForUser(userId: string): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(`cache_${userId}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      console.warn('Failed to clear sessionStorage for user:', error);
    }
  }

  private clearAllSessionStorage(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('cache_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      console.warn('Failed to clear all sessionStorage:', error);
    }
  }

  /**
   * Restore cache from sessionStorage on app initialization
   * Call this when the app starts to restore cached data
   */
  async restoreFromSessionStorage(userId: string): Promise<void> {
    try {
      const dataTypes: CacheableDataType[] = ['allResults', 'prStats', 'prEvents', 'userProfile', 'dashboardStats'];
      
      for (const dataType of dataTypes) {
        const key = this.getSessionStorageKey(userId, dataType);
        const stored = sessionStorage.getItem(key);
        
        if (stored) {
          try {
            const entry: CacheEntry<any> = JSON.parse(stored);
            
            // Reason: Verify the cached entry belongs to the current user to prevent cross-user contamination
            if (entry.userId && entry.userId !== userId) {
              console.log(`Removing cached ${dataType} from sessionStorage - belongs to different user (expected: ${userId}, found: ${entry.userId})`);
              sessionStorage.removeItem(key);
              continue;
            }
            
            // Check if still valid
            const now = Date.now();
            if (now <= entry.expiresAt) {
              let userCache = this.cache.get(userId);
              if (!userCache) {
                userCache = new Map();
                this.cache.set(userId, userCache);
              }
              
              // Reason: Ensure userId is set on restored entries (for backward compatibility)
              if (!entry.userId) {
                entry.userId = userId;
              }
              
              userCache.set(dataType, entry);
              console.log(`Restored ${dataType} from sessionStorage for user ${userId}`);
            } else {
              // Remove expired entry from sessionStorage
              sessionStorage.removeItem(key);
            }
          } catch (parseError) {
            console.warn(`Failed to parse cached ${dataType} from sessionStorage:`, parseError);
            sessionStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Error restoring cache from sessionStorage:', error);
    }
  }
}