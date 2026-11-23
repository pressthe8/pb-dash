import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { FirebaseService } from '../services/firebaseService';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { DataCacheService } from '../services/dataCacheService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { TrainingRadar, WakeArt } from '../components/WorkoutArt';
import { PersonalBestsTableView } from '../components/PersonalBestsTableView';
import { StoredResult } from '../types/concept2';
import { PREvent, SportType, SPORT_MAPPING, UserProfile } from '../types/personalRecords';
import { formatDuration } from '../utils/timeFormatting';
import { asErgSport } from '../../functions/src/workoutSport';
import { REVIEW_PATH, REVIEW_TITLE } from '../features/rowingReview/reviewConfig';
import { Activity, AlertCircle, ArrowRight, ArrowUpRight, Bike, Clock3, Link2, Mountain, Ruler, Waves } from 'lucide-react';

const sportIcons = { rower: Waves, bike: Bike, skierg: Mountain };
const sports = ['rower', 'bike', 'skierg'] as const;
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function ReviewCard() {
  return (
    <Link className="pb-review-card" to={REVIEW_PATH}>
      <WakeArt />
      <div className="pb-review-card-copy">
        <span className="pb-label">{REVIEW_TITLE}</span>
        <h2>Your year<br /><em>on the erg.</em></h2>
      </div>
      <span className="pb-review-card-link">Open review <ArrowUpRight size={17} aria-hidden="true" /></span>
    </Link>
  );
}

function measureDistance(meters: number, { roundDown = false } = {}) {
  const useKilometers = meters >= 1000;
  const distance = useKilometers ? meters / 1000 : meters;

  return {
    value: numberFormat.format(roundDown ? Math.floor(distance) : distance),
    unit: useKilometers ? 'km' : 'm',
  };
}

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
    connectionExpired,
    clearConnectionExpired,
    syncStatus
  } = useAuth();
  const { prStats, loading: prLoading, error: prError, getPREvents } = usePersonalRecords();
  const [allResults, setAllResults] = useState<StoredResult[]>([]);
  const [allPREvents, setAllPREvents] = useState<PREvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const hasLoadedDataRef = useRef(false);

  // Sport filtering state
  const [selectedSport, setSelectedSport] = useState<SportType>('rower');
  const [hasLoadedSportPreference, setHasLoadedSportPreference] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const firebaseService = FirebaseService.getInstance();
  const cloudFunctions = CloudFunctionsService.getInstance();
  const cacheService = DataCacheService.getInstance();

  // Reason: Determine smart default sport based on result counts
  const determineDefaultSport = useCallback((results: StoredResult[], profileSetting?: SportType): SportType => {
    if (profileSetting) return profileSetting;
    
    const sportCounts = new Map<SportType, number>();
    for (const result of results) {
      const sport = asErgSport(result.type);
      if (sport) sportCounts.set(sport, (sportCounts.get(sport) ?? 0) + 1);
    }

    // Return sport with highest count, fallback to 'rower'
    const entries = [...sportCounts];
    if (entries.length === 0) return 'rower';
    
    return entries.reduce((a, b) => a[1] > b[1] ? a : b)[0];
  }, []);

  // Reason: Load sport preference from session storage and profile
  useEffect(() => {
    if (!hasLoadedSportPreference && concept2Connected && !loading && !dataError) {
      const sessionSport = asErgSport(localStorage.getItem('dashboard_sport_filter'));
      const defaultSport = determineDefaultSport(allResults, asErgSport(userProfile?.default_sport));
      
      setSelectedSport(sessionSport || defaultSport);
      setHasLoadedSportPreference(true);
    }
  }, [allResults, userProfile, concept2Connected, loading, dataError, hasLoadedSportPreference, determineDefaultSport]);

  // Reason: Persist sport selection to session storage
  useEffect(() => {
    if (hasLoadedSportPreference) {
      localStorage.setItem('dashboard_sport_filter', selectedSport);
    }
  }, [selectedSport, hasLoadedSportPreference]);

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

  // Reason: Filter data based on selected sport - NOW USING DIRECT SPORT FIELD
  const filteredResults = useMemo(() => 
    allResults.filter(result => asErgSport(result.type) === selectedSport),
    [allResults, selectedSport]
  );

  const filteredStats = useMemo(() => 
    calculateStats(filteredResults), 
    [filteredResults, calculateStats]
  );

  const filteredPREvents = useMemo(() =>
    allPREvents.filter(event => asErgSport(event.sport) === selectedSport),
    [allPREvents, selectedSport]
  );
  const filteredPRStats = useMemo(() => {
    const activityKeys = new Set(filteredPREvents.map(event => event.activity_key));
    return prStats.filter(stat => activityKeys.has(stat.activity_key));
  }, [prStats, filteredPREvents]);

  // Reason: Memoize loadDashboardData to prevent unnecessary recreations
  const loadDashboardData = useCallback(async () => {
    if (!user?.uid) {
      console.warn('loadDashboardData called without valid user');
      return;
    }

    try {
      setLoading(true);
      setDataError(false);
      console.log('Loading dashboard data for connected user');
      
      // Load user profile for sport preference
      const profile = await firebaseService.getUserProfile(user.uid);
      setUserProfile(profile);
      
      // Reason: Try to get cached data first for instant response
      const cachedResults = await cacheService.getCachedData<StoredResult[]>(user.uid, 'allResults');
      const results = cachedResults ?? await firebaseService.getAllResults(user.uid);
      setAllResults(results);
      if (!cachedResults) await cacheService.setCachedData(user.uid, 'allResults', results);
      
      // Load all PR events for the enhanced filtering
      const prEvents = await getPREvents();
      setAllPREvents(prEvents);
      
      console.log(`Dashboard data loaded and cached: ${results.length} total results, ${prEvents.length} PR events`);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setDataError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, firebaseService, cacheService, getPREvents]);

  // Reason: Use ref instead of state to avoid circular dependency
  useEffect(() => {
    // Exit early if conditions aren't met or if we've already loaded
    if (!user || !concept2Connected || hasLoadedDataRef.current) {
      // Reset ref when user or connection changes
      if (!user || !concept2Connected) {
        hasLoadedDataRef.current = false;
        setLoading(false);
      }
      return;
    }

    console.log('User authenticated and Concept2 connected, loading dashboard data');
    hasLoadedDataRef.current = true;
    loadDashboardData();
  }, [user, concept2Connected, loadDashboardData]);

  // Reason: Restore cache when component mounts
  useEffect(() => {
    if (user?.uid) {
      cacheService.restoreFromSessionStorage(user.uid);
    }
  }, [user?.uid, cacheService]);

  const handleConnectConcept2 = async () => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const redirectUri = window.location.origin + '/auth/callback';
      const attempt = await cloudFunctions.beginConcept2Connection(redirectUri);
      clearConnectionExpired();
      window.location.assign(attempt.authorizationUrl);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Unable to connect to Concept2.');
      setConnecting(false);
    }
  };

  if (!concept2Connected) {
    return (
      <div className="pb-dashboard">
        <div className="pb-dash-grid">
          <section className="pb-connect pb-grid-surface">
            <span className="pb-connect-icon"><Link2 size={24} aria-hidden="true" /></span>
            <div>
              <h1>{connectionExpired ? 'Reconnect your Logbook.' : 'Connect your Logbook.'}</h1>
              <p>{connectionExpired
                ? 'Your Concept2 connection has expired. Reconnect to see your training and sync new workouts.'
                : 'Link your Concept2 account to import your workouts and find your personal bests.'}</p>
            </div>
            <button type="button" className="pb-button pb-primary" onClick={handleConnectConcept2} disabled={connecting}>
              {connecting ? 'Connecting…' : connectionExpired ? 'Reconnect to Concept2' : 'Connect to Concept2'}
              {connecting ? <LoadingSpinner size="sm" /> : <ArrowRight size={19} aria-hidden="true" />}
            </button>
            {connectionError
              ? <p className="pb-feedback pb-error" role="alert">{connectionError}</p>
              : <p className="pb-connect-note">You’ll approve the connection on Concept2.</p>}
          </section>
          <ReviewCard />
        </div>
      </div>
    );
  }

  if ((loading || (!dataError && !hasLoadedSportPreference)) && syncStatus === 'idle') {
    return <div className="pb-page-status" role="status"><LoadingSpinner size="lg" /> Loading training data…</div>;
  }

  const metrics = [
    { label: 'Total workouts', icon: Activity, value: numberFormat.format(filteredStats.totalWorkouts), unit: '' },
    { label: 'Total distance', icon: Ruler, ...measureDistance(filteredStats.totalDistance, { roundDown: true }) },
    { label: 'Total time', icon: Clock3, value: formatDuration(filteredStats.totalTime), unit: '' },
    { label: 'Average distance', icon: Ruler, ...measureDistance(filteredStats.averageDistance) },
  ];

  return (
    <div className="pb-dashboard">
      {syncStatus !== 'idle' && (
        <div className="pb-overlay">
          <div className="pb-status-card" role="status">
            <LoadingSpinner size="lg" />
            <h2>{syncStatus === 'syncing' ? 'Syncing workouts' : 'Updating personal bests'}</h2>
            <p>{syncStatus === 'syncing' ? 'Fetching your latest workouts from Concept2…' : 'Checking your new workouts for records…'}</p>
          </div>
        </div>
      )}

      <div className="pb-dash-grid">
        <section className="pb-training pb-grid-surface">
          <div className="pb-training-copy">
            <h1>Your training.</h1>
            <div className="pb-switch pb-sport" role="group" aria-label="Filter training by machine">
              {sports.map(sport => {
                const Icon = sportIcons[sport];
                return (
                  <button type="button" key={sport} aria-pressed={selectedSport === sport}
                    onClick={() => { setSelectedSport(sport); setHasLoadedSportPreference(true); }}>
                    <Icon size={17} aria-hidden="true" /> {SPORT_MAPPING[sport]}
                  </button>
                );
              })}
            </div>
          </div>
          {!dataError && <TrainingRadar results={filteredResults} />}
        </section>
        <ReviewCard />
      </div>

      {dataError && (
        <div className="pb-feedback pb-error pb-dash-feedback" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>We couldn’t load your workout history.</span>
          <button type="button" className="pb-text-button" onClick={loadDashboardData}>Try again</button>
        </div>
      )}

      {!dataError && <section className="pb-history" aria-labelledby="pb-history-title">
        <div className="pb-section-heading">
          <h2 id="pb-history-title">All-time totals</h2>
          <span className="pb-label">{SPORT_MAPPING[selectedSport]}</span>
        </div>
        <dl className="pb-metrics">
          {metrics.map(({ label, icon: Icon, value, unit }) => (
            <div className="pb-metric" key={label}>
              <dt><Icon size={16} aria-hidden="true" /> {label}</dt>
              <dd>{value}{unit && <span> {unit}</span>}</dd>
            </div>
          ))}
        </dl>
      </section>}

      {prError && (
        <div className="pb-feedback pb-error pb-dash-feedback" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>We couldn’t load your personal bests. {prError}</span>
          <button type="button" className="pb-text-button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      {!dataError && !prError && (
        <PersonalBestsTableView key={selectedSport} prStats={filteredPRStats} loading={prLoading}
          allPREvents={filteredPREvents} selectedSport={selectedSport} seasonView={userProfile?.season_view} />
      )}
    </div>
  );
};
