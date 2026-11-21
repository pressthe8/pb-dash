import { useState, useEffect, createContext, useContext } from 'react';
import {
  User, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, GoogleAuthProvider, onAuthStateChanged, signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { CloudFunctionsService, type ReconcileHistoryResult } from '../services/cloudFunctions';
import { DataCacheService } from '../services/dataCacheService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  concept2Connected: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  markConcept2Connected: () => void;
  clearConcept2Connection: () => Promise<void>;
  syncNewResults: () => Promise<number>;
  reconcileHistory: () => Promise<ReconcileHistoryResult>;
  connectionExpired: boolean;
  clearConnectionExpired: () => void;
  syncStatus: 'idle' | 'syncing' | 'processing';
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const useAuthProvider = (): AuthContextType => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [concept2Connected, setConcept2Connected] = useState(false);
  const [connectionExpired, setConnectionExpired] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'processing'>('idle');

  const cloudFunctions = CloudFunctionsService.getInstance();
  const cache = DataCacheService.getInstance();

  async function runSync(uid: string, foreground: boolean): Promise<number> {
    if (foreground) setSyncStatus('syncing');
    try {
      const result = await cloudFunctions.incrementalSync(uid);
      await cache.invalidateCache(uid, 'userProfile');
      await cache.invalidateCache(uid, 'allResults');
      await cache.invalidateCache(uid, 'dashboardStats');
      if (result.newResultIds.length || result.prRepairPending) {
        if (foreground) setSyncStatus('processing');
        await cloudFunctions.processNewResultsAndRecalculate(uid);
        await cache.invalidateCache(uid, 'prStats');
        await cache.invalidateCache(uid, 'prEvents');
      }
      return result.newResultsCount;
    } catch (error) {
      if (auth.currentUser?.uid === uid && error instanceof Error && error.message === 'REAUTH_REQUIRED') {
        setConcept2Connected(false);
        setConnectionExpired(true);
        await cache.invalidateCache(uid, 'userProfile');
      }
      throw error;
    } finally {
      if (foreground) setSyncStatus('idle');
    }
  }

  useEffect(() => {
    let generation = 0;
    let backgroundSync: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (signedInUser) => {
      const currentGeneration = ++generation;
      clearTimeout(backgroundSync);
      setLoading(true);
      setUser(signedInUser);
      setConcept2Connected(false);
      setConnectionExpired(false);

      try {
        if (signedInUser) {
          await cache.restoreFromSessionStorage(signedInUser.uid);
          const status = await cloudFunctions.getConcept2Connection();
          if (currentGeneration !== generation) return;
          setConcept2Connected(status.connected);
          setConnectionExpired(status.reconnectRequired);

          // The callback completes the new connection and performs its own import.
          if (status.connected && window.location.pathname !== '/auth/callback') {
            backgroundSync = setTimeout(() => {
              if (currentGeneration !== generation || auth.currentUser?.uid !== signedInUser.uid) return;
              void runSync(signedInUser.uid, false).catch(error => console.error('Background Concept2 sync failed:', error));
            }, 2000);
          }
        } else {
          await cache.invalidateAllCache();
        }
      } catch (error) {
        console.error('Unable to load Concept2 connection status:', error);
      } finally {
        if (currentGeneration === generation) setLoading(false);
      }
    }, (error) => {
      console.error('Auth state change error:', error);
      setLoading(false);
    });

    return () => {
      generation++;
      unsubscribe();
      clearTimeout(backgroundSync);
    };
  }, [cache, cloudFunctions]);

  return {
    user,
    loading,
    concept2Connected,
    connectionExpired,
    syncStatus,
    signInWithGoogle: async () => { await signInWithPopup(auth, new GoogleAuthProvider()); },
    signInWithEmail: async (email, password) => { await signInWithEmailAndPassword(auth, email, password); },
    signUpWithEmail: async (email, password) => { await createUserWithEmailAndPassword(auth, email, password); },
    resetPassword: email => sendPasswordResetEmail(auth, email),
    signOut: () => firebaseSignOut(auth),
    markConcept2Connected: () => {
      setConcept2Connected(true);
      setConnectionExpired(false);
    },
    clearConcept2Connection: async () => {
      if (!user) return;
      await cloudFunctions.disconnectConcept2();
      setConcept2Connected(false);
      setConnectionExpired(false);
    },
    clearConnectionExpired: () => setConnectionExpired(false),
    syncNewResults: () => {
      if (!user) return Promise.reject(new Error('Sign in to PB Dash first.'));
      return runSync(user.uid, true);
    },
    reconcileHistory: async () => {
      if (!user) throw new Error('Sign in to PB Dash first.');
      setSyncStatus('syncing');
      try {
        return await cloudFunctions.reconcileConcept2History();
      } catch (error) {
        if (auth.currentUser?.uid === user.uid && error instanceof Error && error.message === 'REAUTH_REQUIRED') {
          setConcept2Connected(false);
          setConnectionExpired(true);
        }
        throw error;
      } finally {
        const keys = ['userProfile', 'allResults', 'dashboardStats', 'prStats', 'prEvents'] as const;
        await Promise.all(keys.map(key => cache.invalidateCache(user.uid, key)));
        setSyncStatus('idle');
      }
    },
  };
};

export { AuthContext };
