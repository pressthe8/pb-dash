import { useState, useEffect, createContext, useContext } from 'react';
import { 
  User, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { FirebaseService } from '../services/firebaseService';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { Concept2ApiService } from '../services/concept2Api';
import { DataCacheService } from '../services/dataCacheService';
import { OAuthTokens } from '../types/concept2';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  concept2Connected: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkConcept2Connection: () => Promise<boolean>;
  storeConcept2Tokens: (tokens: OAuthTokens) => Promise<void>;
  updateConcept2Tokens: (tokens: OAuthTokens) => Promise<void>;
  clearConcept2Connection: () => void;
  syncNewResults: () => Promise<number>;
  connectionExpired: boolean;
  clearConnectionExpired: () => void;
  syncStatus: 'idle' | 'syncing' | 'processing';
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthProvider = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [concept2Connected, setConcept2Connected] = useState(false);
  const [connectionExpired, setConnectionExpired] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'processing'>('idle');
  
  // Token caching to reduce database calls
  const [cachedTokens, setCachedTokens] = useState<(OAuthTokens & { last_sync_at?: string }) | null>(null);
  const [tokensCacheTime, setTokensCacheTime] = useState(0);
  const [backgroundSyncTimeout, setBackgroundSyncTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const firebaseService = FirebaseService.getInstance();
  const cloudFunctions = CloudFunctionsService.getInstance();
  const concept2Api = Concept2ApiService.getInstance();
  const cacheService = DataCacheService.getInstance();

  useEffect(() => {
    console.log('Setting up auth state listener');
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user ? `User ${user.uid} (${user.email})` : 'No user');
      setUser(user);
      
      if (user) {
        // Clear any pending background sync
        if (backgroundSyncTimeout) {
          clearTimeout(backgroundSyncTimeout);
          setBackgroundSyncTimeout(null);
        }
        
        // Reason: Restore cache when user signs in
        await cacheService.restoreFromSessionStorage(user.uid);
        
        // Check and refresh Concept2 connection
        try {
          const hasValidConnection = await checkAndRefreshConcept2Connection(user.uid);
          console.log('Concept2 connection status after refresh check:', hasValidConnection);
          setConcept2Connected(hasValidConnection);
          
          // FIXED: Only trigger background sync if we have a valid connection
          if (hasValidConnection) {
            console.log('User has valid Concept2 connection, scheduling background sync');
            const timeoutId = setTimeout(() => {
              // Reason: syncNewResultsInBackground validates tokens internally, no need for redundant check
              syncNewResultsInBackground(user.uid);
            }, 2000);
            setBackgroundSyncTimeout(timeoutId);
          }
        } catch (error) {
          console.error('Error checking/refreshing Concept2 connection:', error);
          setConcept2Connected(false);
        }
      } else {
        // Clear cache and timeouts when user signs out
        setCachedTokens(null);
        setTokensCacheTime(0);
        if (backgroundSyncTimeout) {
          clearTimeout(backgroundSyncTimeout);
          setBackgroundSyncTimeout(null);
        }
        setConcept2Connected(false);
        setConnectionExpired(false);
        
        // Reason: Clear all cache when user signs out
        await cacheService.invalidateAllCache();
      }
      setLoading(false);
    }, (error) => {
      console.error('Auth state change error:', error);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (backgroundSyncTimeout) {
        clearTimeout(backgroundSyncTimeout);
      }
    };
  }, []);

  /**
   * Get tokens with caching to reduce database calls
   * Cache expires after 5 minutes or when tokens are updated
   */
  const getCachedTokens = async (userId: string): Promise<(OAuthTokens & { last_sync_at?: string }) | null> => {
    const now = Date.now();
    const cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Return cached tokens if they're still valid
    if (cachedTokens && tokensCacheTime && (now - tokensCacheTime) < cacheExpiry) {
      console.log('Using cached tokens');
      return cachedTokens;
    }
    
    // Fetch fresh tokens and cache them
    console.log('Fetching fresh tokens');
    const tokens = await firebaseService.getTokens(userId);
    setCachedTokens(tokens);
    setTokensCacheTime(now);
    return tokens;
  };

  /**
   * Clear token cache when tokens are updated
   */
  const clearTokenCache = () => {
    setCachedTokens(null);
    setTokensCacheTime(0);
  };

  /**
   * Update cached profile with new sync timestamp
   */
  const updateCachedProfileSyncTimestamp = async (userId: string, syncTimestamp: string) => {
    try {
      // Get current cached profile
      const cachedProfile = await cacheService.getCachedData(userId, 'userProfile');
      if (cachedProfile) {
        // Update the cached profile with new sync timestamp
        const updatedProfile = {
          ...cachedProfile,
          last_sync_at: syncTimestamp
        };
        await cacheService.setCachedData(userId, 'userProfile', updatedProfile);
        console.log('Updated cached profile with new sync timestamp:', syncTimestamp);
      }
    } catch (error) {
      console.error('Error updating cached profile sync timestamp:', error);
    }
  };

  /**
   * Enhanced connection check with automatic token refresh
   */
  const checkAndRefreshConcept2Connection = async (userId: string): Promise<boolean> => {
    try {
      console.log('Checking Concept2 connection with refresh capability for user:', userId);
      
      const tokens = await getCachedTokens(userId);
      
      if (!tokens || tokens.deleted_at) {
        console.log('No valid tokens found');
        return false;
      }
      
      // Check if tokens need refresh
      if (concept2Api.isTokenExpired(tokens)) {
        console.log('Tokens expired, attempting refresh...');
        
        try {
          const newTokens = await concept2Api.refreshAccessToken(tokens.refresh_token);
          await firebaseService.updateTokens(userId, newTokens);
          clearTokenCache(); // Clear cache after token update
          console.log('Tokens refreshed successfully');
          return true;
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          
          if (refreshError instanceof Error) {
            if (refreshError.message === 'REFRESH_TOKEN_EXPIRED' || 
                refreshError.message === 'INVALID_SCOPE_REAUTH_REQUIRED' ||
                refreshError.message === 'INVALID_CLIENT_CREDENTIALS') {
              console.log('Refresh token expired or invalid, marking tokens as deleted');
              await firebaseService.deleteTokens(userId);
              clearTokenCache(); // Clear cache after token deletion
              return false;
            }
          }
          
          // For other errors, don't immediately delete tokens - they might be temporary
          console.log('Token refresh failed with temporary error, keeping tokens for retry');
          return false;
        }
      }
      
      console.log('Tokens are valid and not expired');
      return true;
    } catch (error) {
      console.error('Error in checkAndRefreshConcept2Connection:', error);
      return false;
    }
  };

  const signInWithGoogle = async () => {
    try {
      console.log('Starting Google sign-in process');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      console.log('Sign-in successful:', result.user.email);
    } catch (error) {
      console.error('Sign-in error:', error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      console.log('Starting email/password sign-in process');
      const result = await signInWithEmailAndPassword(auth, email, password);
      console.log('Email sign-in successful:', result.user.email);
    } catch (error) {
      console.error('Email sign-in error:', error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      console.log('Starting email/password sign-up process');
      const result = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Email sign-up successful:', result.user.email);
    } catch (error) {
      console.error('Email sign-up error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      console.log('Sending password reset email to:', email);
      await sendPasswordResetEmail(auth, email);
      console.log('Password reset email sent successfully');
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  };
  const signOut = async () => {
    try {
      console.log('Starting sign-out process');
      await firebaseSignOut(auth);
      console.log('Sign-out successful');
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    }
  };

  const checkConcept2Connection = async (): Promise<boolean> => {
    if (!user) return false;
    return await checkAndRefreshConcept2Connection(user.uid);
  };

  const clearConcept2Connection = () => {
    if (!user) return;
    
    console.log('Clearing Concept2 connection for user:', user.uid);
    setConcept2Connected(false);
    setConnectionExpired(false);
    clearTokenCache();
    
    // Delete tokens from Firebase
    firebaseService.deleteTokens(user.uid).catch((error) => {
      console.error('Error deleting tokens:', error);
    });
  };

  const clearConnectionExpired = () => {
    setConnectionExpired(false);
  };

  const storeConcept2Tokens = async (tokens: OAuthTokens) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      console.log('Storing Concept2 tokens for user:', user.uid);
      await firebaseService.storeTokens(user.uid, tokens);
      clearTokenCache(); // Clear cache after storing new tokens
      console.log('Tokens stored successfully');
      setConcept2Connected(true);
      setConnectionExpired(false);
    } catch (error) {
      console.error('Error storing Concept2 tokens:', error);
      throw error;
    }
  };

  const updateConcept2Tokens = async (tokens: OAuthTokens) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      console.log('Updating Concept2 tokens for user:', user.uid);
      await firebaseService.updateTokens(user.uid, tokens);
      clearTokenCache(); // Clear cache after updating tokens
      console.log('Tokens updated successfully');
    } catch (error) {
      console.error('Error updating Concept2 tokens:', error);
      throw error;
    }
  };

  const syncNewResults = async (): Promise<number> => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      // Set syncing status
      setSyncStatus('syncing');
      
      // Force refresh the ID token to ensure it's valid for Cloud Function calls
      console.log('Refreshing Firebase ID token before Cloud Function call');
      const idToken = await user.getIdToken(true);
      console.log('ID token refreshed successfully, length:', idToken.length);
    } catch (tokenError) {
      console.error('Error refreshing ID token:', tokenError);
      setSyncStatus('idle');
      throw new Error('Failed to refresh authentication token');
    }
    
    try {
      console.log('Syncing new results via Cloud Function for user:', user.uid);
      
      // First, ensure tokens are valid and refreshed if needed
      const hasValidConnection = await checkAndRefreshConcept2Connection(user.uid);
      if (!hasValidConnection) {
        setSyncStatus('idle');
        throw new Error('REAUTH_REQUIRED');
      }
      
      // Use new incremental sync function
      const syncResponse = await cloudFunctions.incrementalSync(user.uid);
      
      // Update cached profile with new sync timestamp
      await updateCachedProfileSyncTimestamp(user.uid, syncResponse.lastSyncAt);
      
      // If we got new results, process them for PRs SYNCHRONOUSLY
      if (syncResponse.newResultsCount > 0 && syncResponse.newResultIds.length > 0) {
        console.log(`Processing ${syncResponse.newResultIds.length} new results for PRs synchronously`);
        
        // Set processing status
        setSyncStatus('processing');
        
        // Add a small delay to ensure the sync has fully completed
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Process PRs synchronously (wait for completion)
        const prResult = await cloudFunctions.processNewResultsAndRecalculate(user.uid);
        console.log(`Synchronous PR processing completed: ${prResult.newPREventsCreated} new PR events created`);
        
        // Reason: Invalidate relevant cache after sync and PR processing
        await cacheService.invalidateCache(user.uid, 'prStats');
        await cacheService.invalidateCache(user.uid, 'prEvents');
      }
      
      // Reason: Always invalidate results and dashboard stats cache after sync
      await cacheService.invalidateCache(user.uid, 'allResults');
      await cacheService.invalidateCache(user.uid, 'dashboardStats');
      
      console.log(`Sync completed successfully. Added ${syncResponse.newResultsCount || 0} new results.`);
      return syncResponse.newResultsCount;
    } catch (error) {
      console.error('Error syncing new results:', error);
      
      if (error instanceof Error) {
        if (error.message === 'REAUTH_REQUIRED' || 
            error.message.includes('No Concept2 tokens found')) {
          await handleTokenError(error);
        }
      }
      throw error;
    } finally {
      // Always reset sync status
      setSyncStatus('idle');
    }
  };

  /**
   * Background sync for new results (non-blocking) - FIXED with better validation
   */
  const syncNewResultsInBackground = async (userId: string) => {
    try {
      console.log('Starting background sync via Cloud Function for user:', userId);
      
      // FIXED: Validate tokens exist before attempting sync
      const tokens = await getCachedTokens(userId);
      if (!tokens || tokens.deleted_at) {
        console.log('Background sync skipped - no valid tokens found');
        setConcept2Connected(false);
        return;
      }
      
      // FIXED: Check if tokens are expired before sync
      if (concept2Api.isTokenExpired(tokens)) {
        console.log('Background sync skipped - tokens are expired');
        // Don't set connection to false here, let the main auth flow handle refresh
        return;
      }
      
      // Use new incremental sync function
      const syncResponse = await cloudFunctions.incrementalSync(userId);
      
      if (syncResponse.newResultsCount > 0) {
        console.log(`Background sync completed. Added ${syncResponse.newResultsCount} new results.`);
        
        // Update cached profile with new sync timestamp
        await updateCachedProfileSyncTimestamp(userId, syncResponse.lastSyncAt);
        
        // Reason: Invalidate relevant cache after background sync
        await cacheService.invalidateCache(userId, 'allResults');
        await cacheService.invalidateCache(userId, 'dashboardStats');
        
        // Process new results for PRs in background (non-blocking)
        if (syncResponse.newResultIds.length > 0) {
          cloudFunctions.processNewResultsAndRecalculate(userId).then(async (prResult) => {
            console.log(`Background PR processing completed: ${prResult.newPREventsCreated} new PR events created`);
            
            // Reason: Invalidate PR cache after background PR processing
            await cacheService.invalidateCache(userId, 'prStats');
            await cacheService.invalidateCache(userId, 'prEvents');
          }).catch((prError) => {
            console.log('Background PR processing failed (non-critical):', prError);
          });
        }
      } else {
        console.log('Background sync: No new results found');
      }
    } catch (error) {
      console.log('Background sync failed (non-critical):', error);
      
      // Handle token errors even in background sync
      if (error instanceof Error && 
          (error.message === 'REAUTH_REQUIRED' || 
           error.message.includes('No Concept2 tokens found'))) {
        console.log('Background sync detected token issue, updating connection state');
        setConcept2Connected(false);
        setConnectionExpired(true);
        clearTokenCache(); // Clear cache on token errors
        
        // Clean up invalid tokens
        try {
          await firebaseService.deleteTokens(userId);
        } catch (cleanupError) {
          console.error('Error cleaning up tokens in background:', cleanupError);
        }
      }
    }
  };

  const handleTokenError = async (error: Error) => {
    if (!user) return;

    console.log('Handling token error:', error.message);
    
    // Clear connection state immediately
    setConcept2Connected(false);
    clearTokenCache(); // Clear cache on token errors
    
    // Set connection expired flag for UI
    setConnectionExpired(true);
    
    // Send Slack notification for token error (without PII)
    try {
      await cloudFunctions.sendSlackNotification({
        type: 'error',
        userId: user.uid,
        details: {
          errorMessage: error.message,
          context: 'Frontend: Concept2 Token Refresh',
          errorStack: error.stack,
        },
      });
      console.log('Token error Slack notification sent.');
    } catch (slackError) {
      console.error('Failed to send token error Slack notification:', slackError);
      // Don't block user flow if Slack notification fails
    }
    
    // Clean up invalid tokens
    try {
      await firebaseService.deleteTokens(user.uid);
    } catch (cleanupError) {
      console.error('Error cleaning up tokens:', cleanupError);
    }
  };

  return {
    user,
    loading,
    concept2Connected,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signOut,
    checkConcept2Connection,
    storeConcept2Tokens,
    updateConcept2Tokens,
    clearConcept2Connection,
    syncNewResults,
    connectionExpired,
    clearConnectionExpired,
    syncStatus,
  };
};

export { AuthContext };