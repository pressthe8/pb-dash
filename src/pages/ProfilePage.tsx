import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { FirebaseService } from '../services/firebaseService';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { DataCacheService } from '../services/dataCacheService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PRImageGenerator } from '../components/PRImageGenerator';
import { UserProfile, SportType, SPORT_MAPPING } from '../types/personalRecords';
import { 
  User, 
  Calendar, 
  RefreshCw,
  History,
  Trophy, 
  Eye, 
  EyeOff, 
  Unlink, 
  Trash2, 
  AlertTriangle,
  CheckCircle,
  Settings,
  Shield,
  LogOut,
  Image as ImageIcon
} from 'lucide-react';

// Extended profile interface that includes sync timestamp
interface ExtendedUserProfile extends UserProfile {
  last_sync_at?: string;
}

type WorkoutAction = 'sync' | 'reconcile' | 'recalculate';

interface WorkoutFeedback {
  action: WorkoutAction;
  title: string;
  detail?: string;
  error?: boolean;
}

function workoutCount(count: number) {
  return count + (count === 1 ? ' workout' : ' workouts');
}

export const ProfilePage: React.FC = () => {
  const { 
    user, 
    concept2Connected, 
    syncNewResults, 
    reconcileHistory,
    clearConcept2Connection,
    syncStatus,
    signOut
  } = useAuth();
  
  const { prStats, loading: prLoading, getPREvents } = usePersonalRecords();
  
  const [profile, setProfile] = useState<ExtendedUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  const [activeWorkoutAction, setActiveWorkoutAction] = useState<WorkoutAction | null>(null);
  const [workoutFeedback, setWorkoutFeedback] = useState<WorkoutFeedback | null>(null);

  // State for PR image generation
  const [selectedSport, setSelectedSport] = useState<SportType>('rower');
  const [allPREvents, setAllPREvents] = useState<any[]>([]);

  const firebaseService = FirebaseService.getInstance();
  const cloudFunctions = CloudFunctionsService.getInstance();
  const cacheService = DataCacheService.getInstance();

  useEffect(() => {
    loadProfile();
    loadPREvents();
  }, [user]);

  const loadProfile = async (showLoader = true) => {
    if (!user?.uid) return;
    
    try {
      if (showLoader) setLoading(true);
      
      // Reason: Try to get cached profile first for instant response
      const cachedProfile = await cacheService.getCachedData<ExtendedUserProfile>(user.uid, 'userProfile');
      if (cachedProfile) {
        console.log('Using cached user profile with sync timestamp');
        setProfile(cachedProfile);
        return;
      }
      
      // Reason: Load fresh data if not cached
      console.log('Loading fresh user profile from database');
      
      // Load user profile
      const userProfile = await firebaseService.getUserProfile(user.uid);
      if (!userProfile) return;
      console.log('Loaded user profile:', userProfile);
      
      const connection = await cloudFunctions.getConcept2Connection();
      const extendedProfile: ExtendedUserProfile = {
        ...userProfile,
        last_sync_at: connection.lastSyncAt ?? undefined
      };
      
      setProfile(extendedProfile);
      
      // Set default sport from profile
      if (extendedProfile?.default_sport) {
        setSelectedSport(extendedProfile.default_sport);
      }
      
      // Reason: Cache the extended profile (including sync timestamp) for future use
      await cacheService.setCachedData(user.uid, 'userProfile', extendedProfile);
      
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const loadPREvents = async () => {
    if (!user?.uid) return;
    
    try {
      const events = await getPREvents();
      setAllPREvents(events);
    } catch (error) {
      console.error('Error loading PR events:', error);
    }
  };

  const handleSeasonViewToggle = async (enabled: boolean) => {
    if (!user?.uid) return;
    
    try {
      setSaving(true);
      
      // Update profile in Firebase
      await firebaseService.createUserProfile(user.uid);
      const userDocRef = doc(firebaseService.db, 'users', user.uid);
      await updateDoc(userDocRef, {
        season_view: enabled,
        last_updated: new Date().toISOString()
      });
      
      // Update local state
      const updatedProfile = profile ? { ...profile, season_view: enabled } : { season_view: enabled } as ExtendedUserProfile;
      setProfile(updatedProfile);
      
      // Reason: Update cache with new profile data
      await cacheService.setCachedData(user.uid, 'userProfile', updatedProfile);
      
      // Update localStorage for PersonalRecordsCard
      localStorage.setItem('pr_view_mode', enabled ? 'season' : 'year');
      
    } catch (error) {
      console.error('Error updating season view preference:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDefaultSportChange = async (sport: SportType) => {
    if (!user?.uid) return;
    
    try {
      setSaving(true);
      
      // Update profile in Firebase
      await firebaseService.createUserProfile(user.uid);
      const userDocRef = doc(firebaseService.db, 'users', user.uid);
      await updateDoc(userDocRef, {
        default_sport: sport,
        last_updated: new Date().toISOString()
      });
      
      // Update local state
      const updatedProfile = profile ? { ...profile, default_sport: sport } : { default_sport: sport } as ExtendedUserProfile;
      setProfile(updatedProfile);
      
      // Update selected sport for image generator
      setSelectedSport(sport);
      
      // Reason: Update cache with new profile data
      await cacheService.setCachedData(user.uid, 'userProfile', updatedProfile);
      
    } catch (error) {
      console.error('Error updating default sport preference:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePrivacyToggle = async (isPrivate: boolean) => {
    if (!user?.uid) return;
    
    try {
      setSaving(true);
      
      // Update profile in Firebase
      await firebaseService.createUserProfile(user.uid);
      const userDocRef = doc(firebaseService.db, 'users', user.uid);
      await updateDoc(userDocRef, {
        private: isPrivate,
        last_updated: new Date().toISOString()
      });
      
      // Update local state
      const updatedProfile = profile ? { ...profile, private: isPrivate } : { private: isPrivate } as ExtendedUserProfile;
      setProfile(updatedProfile);
      
      // Reason: Update cache with new profile data
      await cacheService.setCachedData(user.uid, 'userProfile', updatedProfile);
      
    } catch (error) {
      console.error('Error updating privacy preference:', error);
    } finally {
      setSaving(false);
    }
  };

  const workoutActionsDisabled = !concept2Connected || syncStatus !== 'idle' || activeWorkoutAction !== null;

  const runWorkoutAction = async (
    action: WorkoutAction,
    failureTitle: string,
    run: (uid: string) => Promise<Omit<WorkoutFeedback, 'action' | 'error'>>,
  ) => {
    if (!user || workoutActionsDisabled) return;

    setActiveWorkoutAction(action);
    setWorkoutFeedback(null);
    try {
      setWorkoutFeedback({ action, ...await run(user.uid) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again.';
      setWorkoutFeedback({
        action,
        title: failureTitle,
        detail: detail === 'REAUTH_REQUIRED' ? 'Reconnect Concept2 and try again.' : detail,
        error: true,
      });
    } finally {
      setActiveWorkoutAction(null);
    }
  };

  const handleSyncData = () => runWorkoutAction('sync', 'Couldn’t sync new workouts', async () => {
    const count = await syncNewResults();
    await Promise.all([loadProfile(false), loadPREvents()]);
    return { title: count ? 'New workouts synced' : 'No new workouts', detail: count ? `Added ${workoutCount(count)}.` : undefined };
  });

  const handleReconcileHistory = () => runWorkoutAction('reconcile', 'Couldn’t sync workout changes', async () => {
    const result = await reconcileHistory();
    await Promise.all([loadProfile(false), loadPREvents()]);
    const { addedCount, updatedCount, removedCount, rebuilt } = result;
    const detail = [
      addedCount ? `Added ${workoutCount(addedCount)}.` : '',
      updatedCount ? `Updated ${workoutCount(updatedCount)}.` : '',
      removedCount ? `Removed ${workoutCount(removedCount)}.` : '',
      rebuilt ? 'Recalculated PRs.' : '',
    ].filter(Boolean).join(' ');
    return {
      title: addedCount || updatedCount || removedCount ? 'Workout changes synced' : 'Workout history is up to date',
      detail,
    };
  });

  const handleRecalculatePRs = () => runWorkoutAction('recalculate', 'Couldn’t recalculate PRs', async uid => {
    await cloudFunctions.processAllResultsForPRs(uid);
    await Promise.all([cacheService.invalidateCache(uid, 'prStats'), cacheService.invalidateCache(uid, 'prEvents')]);
    await loadPREvents();
    return { title: 'PRs recalculated' };
  });

  const handleDisconnectConcept2 = async () => {
    if (!user) return;
    
    try {
      await clearConcept2Connection();
      setShowDisconnectConfirm(false);
      
      // Reason: Clear all cache when disconnecting
      await cacheService.invalidateAllCache();
      
      // Reload profile
      await loadProfile();
    } catch (error) {
      console.error('Error disconnecting Concept2:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'DELETE') return;
    
    try {
      setDeleting(true);
      console.log('Starting account deletion process');
      
      // Call Cloud Function to delete all user data
      await cloudFunctions.deleteUserAccount(user.uid);
      console.log('Cloud Function deletion completed');
      
      // Clear all local caches and storage
      await cacheService.invalidateAllCache();
      localStorage.clear();
      sessionStorage.clear();
      console.log('Local storage cleared');
      
      // Note: Firebase Auth user deletion is handled by the Cloud Function
      // The user will be automatically signed out when their account is deleted
      
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
      
      // Show success message briefly before redirect
      alert('Account deleted successfully. You will be redirected to the login page.');
      
      // Redirect to login page
      window.location.href = '/login';
      
    } catch (error) {
      console.error('Error deleting account:', error);
      alert(`Account deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderWorkoutFeedback = (action: WorkoutAction) => {
    if (workoutFeedback?.action !== action) return null;
    const { title, detail, error } = workoutFeedback;
    const Icon = error ? AlertTriangle : CheckCircle;
    return (
      <div
        role={error ? 'alert' : 'status'}
        className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${error
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          {detail && <p className="mt-0.5">{detail}</p>}
        </div>
      </div>
    );
  };

  const isSyncing = activeWorkoutAction === 'sync';
  const isReconciling = activeWorkoutAction === 'reconcile';
  const isRecalculating = activeWorkoutAction === 'recalculate';
  const workoutButtonClass = 'inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[14rem]';

  // Filter PR stats by selected sport
  const filteredPRStats = prStats.filter(stat => {
    const activityEvents = allPREvents.filter(event => event.activity_key === stat.activity_key);
    return activityEvents.some(event => event.sport === selectedSport);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-600 mt-1">Manage your account and preferences</p>
      </div>

      {/* User Information Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <User className="w-5 h-5 text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900">User Information</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Google Profile Info with Sign Out Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-teal-500 rounded-full flex items-center justify-center">
                {user?.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt="Profile" 
                    className="w-16 h-16 rounded-full"
                  />
                ) : (
                  <User className="w-8 h-8 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {user?.displayName || 'User'}
                </h3>
                <p className="text-slate-600">{user?.email}</p>
                <p className="text-sm text-slate-500">Google Account</p>
              </div>
            </div>
            
            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors duration-200"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>

          {/* Account Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Concept2 User ID
              </label>
              <p className="text-slate-900 bg-slate-50 px-3 py-2 rounded-lg">
                {profile?.user_id || 'Not connected'}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Member Since
              </label>
              <p className="text-slate-900 bg-slate-50 px-3 py-2 rounded-lg">
                {formatDate(profile?.created_at)}
              </p>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Last Concept2 Sync
              </label>
              <p className="text-slate-900 bg-slate-50 px-3 py-2 rounded-lg">
                {formatLastSync(profile?.last_sync_at)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="workout-data-heading" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-200 p-6">
          <RefreshCw className="w-5 h-5 text-slate-600" aria-hidden="true" />
          <h2 id="workout-data-heading" className="text-xl font-semibold text-slate-900">Workout data</h2>
        </div>

        <div className="divide-y divide-slate-200">
          <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium text-slate-900">New workouts</h3>
              <p className="mt-1 text-sm text-slate-600">Import workouts you’ve added to your Concept2 Logbook.</p>
              {renderWorkoutFeedback('sync')}
            </div>
            <button
              onClick={handleSyncData}
              disabled={workoutActionsDisabled}
              aria-busy={isSyncing}
              className={workoutButtonClass + ' bg-blue-600 text-white hover:bg-blue-700'}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              <span>{isSyncing ? syncStatus === 'processing' ? 'Updating PRs…' : 'Syncing new data…' : 'Sync New Data'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 bg-blue-50 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-medium text-slate-900">Edited or deleted workouts</h3>
              <p className="mt-1 text-sm text-slate-600">Use this after changing an existing workout in Concept2. Your PRs will update too.</p>
              {renderWorkoutFeedback('reconcile')}
            </div>
            <button
              onClick={handleReconcileHistory}
              disabled={workoutActionsDisabled}
              aria-busy={isReconciling}
              className={workoutButtonClass + ' border border-blue-300 bg-white text-blue-900 hover:bg-blue-100'}
            >
              <History className={`w-4 h-4 ${isReconciling ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              <span>{isReconciling ? 'Checking history…' : 'Sync edits and deletions'}</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium text-slate-900">Personal records</h3>
              <p className="mt-1 text-sm text-slate-600">Rebuild PRs from the workouts already in PB Dash.</p>
              {renderWorkoutFeedback('recalculate')}
            </div>
            <button
              onClick={handleRecalculatePRs}
              disabled={workoutActionsDisabled}
              aria-busy={isRecalculating}
              className={workoutButtonClass + ' border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}
            >
              {isRecalculating
                ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                : <Trophy className="h-4 w-4" aria-hidden="true" />}
              <span>{isRecalculating ? 'Recalculating…' : 'Recalculate All PRs'}</span>
            </button>
          </div>
        </div>

        {!concept2Connected && (
          <p className="border-t border-slate-200 px-6 py-3 text-sm text-amber-700">Connect Concept2 to manage your workout data.</p>
        )}
      </section>

      {/* Settings Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Default Sport Setting */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Default Sport</h3>
              <p className="text-sm text-slate-600">Choose which sport to show by default on dashboard</p>
            </div>
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              {(['rower', 'bike', 'skierg'] as SportType[]).map((sport) => (
                <button
                  key={sport}
                  onClick={() => handleDefaultSportChange(sport)}
                  disabled={saving}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200 ${
                    profile?.default_sport === sport
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {SPORT_MAPPING[sport]}
                </button>
              ))}
            </div>
          </div>

          {/* Season vs Year Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Default PR View</h3>
              <p className="text-sm text-slate-600">Choose whether to show seasonal or yearly personal records by default</p>
            </div>
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => handleSeasonViewToggle(true)}
                disabled={saving}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200 ${
                  profile?.season_view !== false
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Season
              </button>
              <button
                onClick={() => handleSeasonViewToggle(false)}
                disabled={saving}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200 ${
                  profile?.season_view === false
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Year
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PR Image Generator Section */}
      {concept2Connected && !prLoading && filteredPRStats.length > 0 && (
        <PRImageGenerator 
          prStats={filteredPRStats}
          selectedSport={selectedSport}
          userDisplayName={user?.displayName || 'Athlete'}
        />
      )}

      {/* Privacy Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <Shield className="w-5 h-5 text-slate-600" />
            <h2 className="text-xl font-semibold text-slate-900">Privacy</h2>
          </div>
        </div>
        
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Profile Visibility</h3>
              <p className="text-sm text-slate-600">Control whether your profile can be viewed publicly</p>
            </div>
            <button
              onClick={() => handlePrivacyToggle(!(profile?.private !== false))}
              disabled={saving}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors duration-200 ${
                profile?.private !== false
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {profile?.private !== false ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span>Private</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Public</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl shadow-sm border border-red-200">
        <div className="p-6 border-b border-red-200">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-xl font-semibold text-red-900">Danger Zone</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Disconnect Concept2 */}
          <div className="flex items-center justify-between p-4 border border-orange-200 rounded-lg bg-orange-50">
            <div>
              <h3 className="text-sm font-medium text-orange-900">Disconnect Concept2</h3>
              <p className="text-sm text-orange-700">Remove Concept2 authorization. You can reconnect anytime.</p>
            </div>
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={!concept2Connected}
              className="flex items-center space-x-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Unlink className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          </div>

          {/* Delete Account */}
          <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
            <div>
              <h3 className="text-sm font-medium text-red-900">Delete Account</h3>
              <p className="text-sm text-red-700">Permanently delete your account and all data. This cannot be undone.</p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="flex items-center space-x-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <LoadingSpinner size="sm" className="text-white" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span>{deleting ? 'Deleting...' : 'Delete'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 max-w-md w-full">
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Unlink className="w-6 h-6 text-orange-600" />
              </div>
              
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Disconnect Concept2?
              </h3>
              
              <p className="text-slate-600 mb-6">
                This will remove your Concept2 authorization. Your data will remain saved, but you won't be able to sync new workouts until you reconnect.
              </p>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnectConcept2}
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors duration-200"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 max-w-md w-full">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Delete Account?
              </h3>
              
              <p className="text-slate-600 mb-4">
                This will permanently delete your account and all associated data including workouts, personal records, and preferences. This action cannot be undone.
              </p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Type "DELETE" to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={deleting}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:opacity-50"
                  placeholder="DELETE"
                />
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {deleting ? (
                    <>
                      <LoadingSpinner size="sm" className="text-white" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete Account</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
