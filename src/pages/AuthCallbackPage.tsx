import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { FirebaseService } from '../services/firebaseService';
import { DataCacheService } from '../services/dataCacheService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { AppFooter, Brand } from '../components/Brand';

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, markConcept2Connected } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting your account...');
  
  const hasProcessed = useRef(false);
  const redirect = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(redirect.current), []);

  const cloudFunctions = CloudFunctionsService.getInstance();
  const firebaseService = FirebaseService.getInstance();
  const cacheService = DataCacheService.getInstance();

  useEffect(() => {
    // Wait for authentication state to be fully loaded
    if (loading) {
      return;
    }

    if (!user) {
      setStatus('error');
      setMessage('User not authenticated. Please log in first.');
      return;
    }

    if (hasProcessed.current) {
      console.log('Callback already processed, skipping duplicate execution');
      return;
    }
    
    hasProcessed.current = true;
    processAuthCallback();
  }, [loading, user]);

  const processAuthCallback = async () => {
    try {
      console.log('Starting callback handling');
      
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setMessage(`Authentication failed: ${error}`);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authorization code or state parameter');
        return;
      }

      console.log(`User authenticated: ${user!.uid}`);
      setMessage('Securing your connection...');
      
      window.history.replaceState(window.history.state, '', '/auth/callback');

      // The callable verifies and consumes the state for the signed-in Firebase account.
      await cloudFunctions.completeConcept2Connection(code, state);
      markConcept2Connected();
      await firebaseService.createUserProfile(user!.uid);
      await cacheService.invalidateCache(user!.uid, 'userProfile');

      setMessage('Loading your workout history...');
      
      // Trigger initial data load via Cloud Function (FAST - no PR processing)
      let syncResponse;
      try {
        console.log('Calling initialDataLoad Cloud Function...');
        syncResponse = await cloudFunctions.initialDataLoad(user!.uid);
        console.log(`Initial data load successful: ${syncResponse.newResultsCount} new results, ${syncResponse.totalResultsCount} total results`);
      } catch (syncError) {
        console.error('Initial data load failed:', syncError);
        
        // Enhanced error handling for Cloud Function failures
        if (syncError instanceof Error) {
          if (syncError.message.includes('INTERNAL') || syncError.message.includes('functions/internal')) {
            throw new Error('Cloud Function configuration error. Please ensure Firebase Functions are properly deployed and configured.');
          } else if (syncError.message.includes('unauthenticated')) {
            throw new Error('Authentication token expired. Please try signing in again.');
          } else if (syncError.message.includes('permission-denied')) {
            throw new Error('Permission denied. Please check your Firebase security rules.');
          }
        }
        throw syncError;
      }
      
      // NEW: Extract and store Concept2 User ID if we have results
      if (syncResponse.totalResultsCount > 0) {
        setMessage('Setting up your profile...');
        
        try {
          // Get one result to extract the Concept2 User ID
          const allResults = await firebaseService.getAllResults(user!.uid);
          if (allResults.length > 0) {
            const concept2UserId = allResults[0].user_id.toString();
            console.log(`Extracted Concept2 User ID: ${concept2UserId}`);
            
            // Update user profile with Concept2 User ID
            await firebaseService.createUserProfile(user!.uid, concept2UserId);
            console.log('User profile updated with Concept2 User ID');
          }
        } catch (profileError) {
          console.warn(`Warning: Could not update user profile: ${profileError instanceof Error ? profileError.message : 'Unknown error'}`);
          // Don't fail the entire flow for profile update issues
        }
      }
      
      // Determine if this is a new user or returning user
      const isNewUser = syncResponse.totalResultsCount === syncResponse.newResultsCount;
      
      if (isNewUser) {
        // NEW USER: Complete PR setup for all results
        console.log('New user detected - performing complete PR setup');
        setMessage('Organizing your personal bests...');
        
        try {
          console.log('Calling processAllResultsForPRs Cloud Function...');
          const prResponse = await cloudFunctions.processAllResultsForPRs(user!.uid);
          console.log(`Complete PR setup: ${prResponse.totalPRsProcessed} PRs across ${prResponse.activitiesProcessed} activities`);
          
          // Reason: Invalidate PR cache after processing to ensure fresh data on dashboard
          console.log('Invalidating PR cache after new user setup');
          await cacheService.invalidateCache(user!.uid, 'prStats');
          await cacheService.invalidateCache(user!.uid, 'prEvents');
          
          setStatus('success');
          setMessage(`Welcome to PB Dash! We've imported ${syncResponse.totalResultsCount} workouts and set up ${prResponse.totalPRsProcessed} personal bests.`);
        } catch (prError) {
          console.error('PR processing failed for new user:', prError);
          
          // Enhanced error handling for PR processing
          if (prError instanceof Error) {
            if (prError.message.includes('INTERNAL') || prError.message.includes('functions/internal')) {
              throw new Error('Personal records processing failed due to Cloud Function configuration. Your workouts were imported successfully, but personal records need to be processed manually.');
            }
          }
          throw prError;
        }
      } else {
        // RETURNING USER: Process new results if any
        console.log('Returning user detected - processing new results');
        
        if (syncResponse.newResultsCount > 0 || syncResponse.prRepairPending) {
          setMessage('Organizing your personal bests...');
          
          try {
            console.log(`Processing ${syncResponse.newResultsCount} new results for PRs`);
            const prResponse = await cloudFunctions.processNewResultsAndRecalculate(user!.uid);
            console.log(`PR processing completed: ${prResponse.totalPRsProcessed} total PRs across ${prResponse.activitiesProcessed} activities`);
            
            // Reason: Invalidate PR cache after processing to ensure fresh data on dashboard
            console.log('Invalidating PR cache after returning user PR processing');
            await cacheService.invalidateCache(user!.uid, 'prStats');
            await cacheService.invalidateCache(user!.uid, 'prEvents');
            
            setStatus('success');
            setMessage(`Welcome back! We've added ${syncResponse.newResultsCount} new workouts and updated your personal bests.`);
          } catch (prError) {
            console.error('PR processing failed for returning user:', prError);
            
            // Enhanced error handling for PR processing
            if (prError instanceof Error) {
              if (prError.message.includes('INTERNAL') || prError.message.includes('functions/internal')) {
                // For returning users, we can still show success even if PR processing fails
                setStatus('success');
                setMessage(`Welcome back! We've added ${syncResponse.newResultsCount} new workouts. Personal records will be updated shortly.`);
                return;
              }
            }
            throw prError;
          }
        } else {
          // No new results
          console.log('No new results to process');
          setStatus('success');
          setMessage(`Welcome back! Your account is up to date.`);
        }
      }
      
      // Redirect to dashboard after a short delay
      redirect.current = setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
      
    } catch (error) {
      console.error('Callback handling failed:', error);
      setStatus('error');
      
      // Enhanced error message handling
      let errorMessage = 'An unexpected error occurred';
      if (error instanceof Error) {
        if (error.message.includes('Cloud Function configuration')) {
          errorMessage = error.message + ' Please contact support if this issue persists.';
        } else if (error.message.includes('Authentication token')) {
          errorMessage = error.message + ' Please try signing in again.';
        } else if (error.message.includes('Personal records processing failed')) {
          errorMessage = error.message + ' You can manually recalculate your personal records from your profile page.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setMessage(errorMessage);
    }
  };

  const title = status === 'loading' ? 'Connecting your Logbook' : status === 'success' ? 'Logbook connected' : 'Connection interrupted';
  const StatusIcon = status === 'success' ? CheckCircle : AlertCircle;

  return (
    <div className="pb-app">
      <header className="pb-header"><div className="pb-wrap pb-mast"><Brand to="/dashboard" /></div></header>
      <main className="pb-wrap pb-callback">
        <section className="pb-status-card pb-grid-surface" aria-labelledby="callback-title">
          <div className="pb-connect-icon" data-status={status}>
            {status === 'loading' ? <LoadingSpinner size="lg" /> : <StatusIcon size={27} aria-hidden="true" />}
          </div>
          <h1 id="callback-title">{title}</h1>
          <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>
          {status !== 'loading' && (
            <button type="button" className="pb-button pb-primary" onClick={() => navigate(user ? '/dashboard' : '/login', { replace: true })}>
              {user ? 'Go to dashboard' : 'Go to sign in'} <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
        </section>
      </main>
      <AppFooter />
    </div>
  );
};
