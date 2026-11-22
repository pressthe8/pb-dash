import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { FirebaseService } from '../services/firebaseService';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { DataCacheService } from '../services/dataCacheService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PREvent, UserProfile, SportType, SPORT_MAPPING } from '../types/personalRecords';
import { asErgSport } from '../../functions/src/workoutSport';
import { 
  User, 
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
  LogOut
} from 'lucide-react';

const PRImageGenerator = lazy(() => import('../components/PRImageGenerator').then(module => ({ default: module.PRImageGenerator })));

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
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  
  const [activeWorkoutAction, setActiveWorkoutAction] = useState<WorkoutAction | null>(null);
  const [workoutFeedback, setWorkoutFeedback] = useState<WorkoutFeedback | null>(null);

  // State for PR image generation
  const [selectedSport, setSelectedSport] = useState<SportType>('rower');
  const [allPREvents, setAllPREvents] = useState<PREvent[]>([]);

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
        if (cachedProfile.default_sport) setSelectedSport(cachedProfile.default_sport);
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
      
      // Preserve the period preference for views opened before a profile is loaded.
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
      localStorage.setItem('dashboard_sport_filter', sport);
      
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
    if (!user || disconnecting) return;
    setDisconnecting(true);
    setDisconnectError('');
    try {
      await clearConcept2Connection();
      setShowDisconnectConfirm(false);
      
      // Reason: Clear all cache when disconnecting
      await cacheService.invalidateAllCache();
      
      // Reload profile
      await loadProfile();
    } catch (error) {
      console.error('Error disconnecting Concept2:', error);
      setDisconnectError('Couldn’t disconnect Concept2. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'DELETE') return;

    setDeleting(true);
    setDeleteError('');
    try {
      await cloudFunctions.deleteUserAccount(user.uid);
    } catch (error) {
      console.error('Error deleting account:', error);
      const detail = error as { code?: string; message?: string };
      setDeleteError(
        (detail?.code === 'functions/aborted' || detail?.code === 'functions/unavailable') && detail.message
          ? detail.message
          : 'Couldn’t confirm that account deletion completed. Please try again.'
      );
      setDeleting(false);
      return;
    }

    try {
      await cacheService.invalidateAllCache();
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      console.error('Error clearing local data after account deletion:', error);
    }
    await signOut().catch(error => console.error('Error signing out after account deletion:', error));
    alert('Your PB Dash account has been deleted.');
    window.location.replace('/login');
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
        className={`pb-feedback pb-profile-feedback ${error ? 'pb-error' : ''}`}
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

  // Filter PR stats by selected sport
  const filteredPRStats = prStats.filter(stat => {
    const activityEvents = allPREvents.filter(event => event.activity_key === stat.activity_key);
    return activityEvents.some(event => asErgSport(event.sport) === selectedSport);
  });

  if (loading) {
    return <div className="pb-page-status" role="status"><LoadingSpinner size="lg" /> Loading profile…</div>;
  }

  const workoutActions = [
    {
      key: 'sync', icon: RefreshCw, title: 'New workouts',
      description: 'Import workouts you’ve added to your Concept2 Logbook.',
      label: isSyncing ? syncStatus === 'processing' ? 'Updating PRs…' : 'Syncing new data…' : 'Sync new data',
      pending: isSyncing, run: handleSyncData,
    },
    {
      key: 'reconcile', icon: History, title: 'Edited or deleted workouts',
      description: 'Update your history and personal bests after changing workouts in Concept2.',
      label: isReconciling ? 'Checking history…' : 'Sync edits and deletions',
      pending: isReconciling, run: handleReconcileHistory,
    },
    {
      key: 'recalculate', icon: Trophy, title: 'Personal records',
      description: 'Rebuild records from the workouts already in PB Dash.',
      label: isRecalculating ? 'Recalculating…' : 'Recalculate all PRs',
      pending: isRecalculating, run: handleRecalculatePRs,
    },
  ] as const;
  const isPrivate = profile?.private !== false;

  return (
    <div className="pb-profile">
      <section className="pb-profile-hero pb-grid-surface">
        <div>
          <h1>Profile</h1>
          <div className="pb-profile-identity">
            <span className="pb-avatar">
              {user?.photoURL ? <img src={user.photoURL} alt="" /> : <User size={22} aria-hidden="true" />}
            </span>
            <div>
              {user?.displayName && <strong>{user.displayName}</strong>}
              <p>{user?.email}</p>
            </div>
          </div>
        </div>
        <button type="button" className="pb-button" onClick={handleSignOut}><LogOut size={16} aria-hidden="true" /> Sign out</button>
      </section>

      <section className="pb-panel pb-settings" aria-labelledby="workout-data-heading">
        <header className="pb-settings-title">
          <RefreshCw size={20} aria-hidden="true" />
          <h2 id="workout-data-heading">Workout data</h2>
        </header>
        <dl className="pb-profile-facts">
          <div><dt>Concept2 user ID</dt><dd>{profile?.user_id || '—'}</dd></div>
          <div><dt>Member since</dt><dd>{formatDate(profile?.created_at)}</dd></div>
          <div><dt>Last Concept2 sync</dt><dd>{formatLastSync(profile?.last_sync_at)}</dd></div>
        </dl>
        {!concept2Connected && (
          <div className="pb-setting-row">
            <p>Connect Concept2 to manage your workout data.</p>
            <Link className="pb-button pb-primary" to="/dashboard">Connect Logbook</Link>
          </div>
        )}
        {workoutActions.map(({ key, icon: Icon, title, description, label, pending, run }) => (
          <div className="pb-setting-row" key={key}>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
              {renderWorkoutFeedback(key)}
            </div>
            <button type="button" className={`pb-button ${key === 'sync' ? 'pb-primary' : ''}`}
              disabled={workoutActionsDisabled} aria-busy={pending} onClick={run}>
              {pending ? <LoadingSpinner size="sm" /> : <Icon size={16} aria-hidden="true" />} {label}
            </button>
          </div>
        ))}
      </section>

      <section className="pb-panel pb-settings" aria-labelledby="preferences-title">
        <header className="pb-settings-title"><Settings size={20} aria-hidden="true" /><h2 id="preferences-title">Training preferences</h2></header>
        <div className="pb-setting-row">
          <div><h3>Default machine</h3><p>Choose which machine to show when you first open the dashboard.</p></div>
          <div className="pb-switch" role="group" aria-label="Default machine">
            {(['rower', 'bike', 'skierg'] as const).map(sport => (
              <button type="button" key={sport} onClick={() => handleDefaultSportChange(sport)}
                disabled={saving} aria-pressed={selectedSport === sport}>{SPORT_MAPPING[sport]}</button>
            ))}
          </div>
        </div>
        <div className="pb-setting-row">
          <div><h3>Record periods</h3><p>Group personal bests by training season or calendar year.</p></div>
          <div className="pb-switch" role="group" aria-label="Record periods">
            <button type="button" onClick={() => handleSeasonViewToggle(true)} disabled={saving} aria-pressed={profile?.season_view !== false}>Season</button>
            <button type="button" onClick={() => handleSeasonViewToggle(false)} disabled={saving} aria-pressed={profile?.season_view === false}>Year</button>
          </div>
        </div>
      </section>

      {concept2Connected && !prLoading && filteredPRStats.length > 0 && (
        <Suspense fallback={<p className="pb-panel pb-records-empty" role="status">Loading image tools…</p>}>
          <PRImageGenerator prStats={filteredPRStats} selectedSport={selectedSport} userDisplayName={user?.displayName || 'Athlete'} />
        </Suspense>
      )}

      <section className="pb-panel pb-settings" aria-labelledby="privacy-title">
        <header className="pb-settings-title"><Shield size={20} aria-hidden="true" /><h2 id="privacy-title">Privacy</h2></header>
        <div className="pb-setting-row">
          <div><h3>Profile visibility</h3><p>Control whether your profile can be viewed publicly.</p></div>
          <button className="pb-button" type="button" onClick={() => handlePrivacyToggle(!isPrivate)} disabled={saving}>
            {isPrivate ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            {isPrivate ? 'Private' : 'Public'}
          </button>
        </div>
      </section>

      <section className="pb-panel pb-settings pb-risk" aria-labelledby="account-actions-title">
        <header className="pb-settings-title"><AlertTriangle size={20} aria-hidden="true" /><h2 id="account-actions-title">Account actions</h2></header>
        <div className="pb-setting-row">
          <div><h3>Disconnect Concept2</h3><p>Remove access to your Logbook. You can reconnect anytime.</p></div>
          <button className="pb-button pb-danger" type="button" disabled={!concept2Connected}
            onClick={() => { setDisconnectError(''); setShowDisconnectConfirm(true); }}>
            <Unlink size={16} aria-hidden="true" /> Disconnect
          </button>
        </div>
        <div className="pb-setting-row">
          <div><h3>Delete account</h3><p>Permanently delete your PB Dash account and data.</p></div>
          <button type="button" className="pb-button pb-danger" disabled={deleting}
            onClick={() => { setDeleteError(''); setShowDeleteConfirm(true); }}>
            <Trash2 size={16} aria-hidden="true" /> Delete account
          </button>
        </div>
      </section>

      {showDisconnectConfirm && (
        <ConfirmationDialog title="Disconnect Concept2?" busy={disconnecting} close={() => setShowDisconnectConfirm(false)}>
          <p>Your imported data stays in PB Dash. Reconnect your Logbook to sync new workouts.</p>
          {disconnectError && <p className="pb-feedback pb-error" role="alert">{disconnectError}</p>}
          <div className="pb-dialog-actions">
            <button className="pb-button" type="button" onClick={() => setShowDisconnectConfirm(false)} disabled={disconnecting}>Cancel</button>
            <button className="pb-button pb-danger" type="button" onClick={handleDisconnectConcept2} disabled={disconnecting}>{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button>
          </div>
        </ConfirmationDialog>
      )}

      {showDeleteConfirm && (
        <ConfirmationDialog title="Delete account?" busy={deleting}
          close={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>
          <p>This deletes your PB Dash account, imported workouts, personal records, preferences and shared images. Your original workouts stay in the Concept2 Logbook.</p>
          <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
          <input className="pb-input" id="delete-confirmation" value={deleteConfirmText}
            onChange={event => setDeleteConfirmText(event.target.value)} disabled={deleting} autoComplete="off" />
          {deleteError && <p className="pb-feedback pb-error" role="alert">{deleteError}</p>}
          <div className="pb-dialog-actions">
            <button className="pb-button" type="button" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} disabled={deleting}>Cancel</button>
            <button className="pb-button pb-danger" type="button" onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || deleting}>
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </ConfirmationDialog>
      )}
    </div>
  );
};

function ConfirmationDialog({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: React.ReactNode }) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog className="pb-dialog" ref={dialog} aria-labelledby="pb-dialog-title" onCancel={event => {
      event.preventDefault();
      if (!busy) close();
    }}>
      <h2 id="pb-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
