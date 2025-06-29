import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Concept2ApiService } from '../services/concept2Api';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { FirebaseService } from '../services/firebaseService';
import { DataCacheService } from '../services/dataCacheService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BoltBadge } from '../components/BoltBadge';
import { CheckCircle, AlertCircle } from 'lucide-react';

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, storeConcept2Tokens } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting your account...');
  
  const hasProcessed = useRef(false);

  const concept2Api = Concept2ApiService.getInstance();
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
      
      // Exchange code for tokens
      const tokens = await concept2Api.exchangeCodeForToken(code, state);
      console.log('Token exchange successful');
      
      // Store tokens in Firebase
      await storeConcept2Tokens(tokens);
      console.log('Token storage successful');
      
      // CRITICAL FIX: Force refresh Firebase ID token and wait for it to complete
      // This ensures the token is fresh and valid for Cloud Function calls
      try {
        console.log('Forcing Firebase ID token refresh...');
        const freshIdToken = await user!.getIdToken(true);
        console.log(`Firebase ID token refreshed successfully, length: ${freshIdToken.length}`);
        
        // Add a longer delay to ensure the token is fully propagated
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Token propagation delay completed');
      } catch (tokenError) {
        console.error(`Critical error refreshing ID token: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        throw new Error('Failed to refresh authentication token for Cloud Function access');
      }
      
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
        
        if (syncResponse.newResultsCount > 0) {
          setMessage('Organizing your personal bests...');
          
          try {
            // For returning users with new results, we need to use processAllResultsForPRs
            // because initialDataLoad doesn't provide newResultIds, and we need to ensure
            // the new results are properly processed for PRs
            console.log(`Processing ${syncResponse.newResultsCount} new results for PRs`);
            console.log('Calling processAllResultsForPRs Cloud Function...');
            const prResponse = await cloudFunctions.processAllResultsForPRs(user!.uid);
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
      setTimeout(() => {
        navigate('/dashboard');
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

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <LoadingSpinner size="lg" className="text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-16 h-16 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      {/* Bolt.new Badge */}
      <BoltBadge />
      
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200 text-center">
          <div className="mb-6">
            {getStatusIcon()}
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            {status === 'loading' && 'Connecting Account'}
            {status === 'success' && 'Connection Successful!'}
            {status === 'error' && 'Connection Failed'}
          </h2>
          
          <p className={`${getStatusColor()} mb-6`}>
            {message}
          </p>
          
          {status === 'success' && (
            <p className="text-sm text-slate-500">
              Redirecting to your dashboard...
            </p>
          )}
          
          {status === 'error' && (
            <div className="space-y-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full bg-blue-500 text-white py-3 px-6 rounded-xl 
                         hover:bg-blue-600 transition-colors duration-200"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full bg-slate-100 text-slate-700 py-3 px-6 rounded-xl 
                         hover:bg-slate-200 transition-colors duration-200"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};