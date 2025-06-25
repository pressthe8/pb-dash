import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Concept2ApiService } from '../services/concept2Api';
import { CloudFunctionsService } from '../services/cloudFunctions';
import { FirebaseService } from '../services/firebaseService';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { CheckCircle, AlertCircle } from 'lucide-react';

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, storeConcept2Tokens } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting your account...');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  const hasProcessed = useRef(false);

  const concept2Api = Concept2ApiService.getInstance();
  const cloudFunctions = CloudFunctionsService.getInstance();
  const firebaseService = FirebaseService.getInstance();

  useEffect(() => {
    // Wait for authentication state to be fully loaded
    if (loading) {
      addDebugInfo('Waiting for authentication state to load...');
      return;
    }

    if (!user) {
      addDebugInfo('User not authenticated after loading completed');
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

  const addDebugInfo = (info: string) => {
    console.log('Auth Callback:', info);
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`]);
  };

  const processAuthCallback = async () => {
    try {
      addDebugInfo('Starting callback handling');
      
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

      addDebugInfo(`User authenticated: ${user!.uid}`);
      setMessage('Securing your connection...');
      
      // Exchange code for tokens
      const tokens = await concept2Api.exchangeCodeForToken(code, state);
      addDebugInfo('Token exchange successful');
      
      // Store tokens in Firebase
      await storeConcept2Tokens(tokens);
      addDebugInfo('Token storage successful');
      
      // CRITICAL FIX: Force refresh Firebase ID token and wait for it to complete
      // This ensures the token is fresh and valid for Cloud Function calls
      try {
        addDebugInfo('Forcing Firebase ID token refresh...');
        const freshIdToken = await user!.getIdToken(true);
        addDebugInfo(`Firebase ID token refreshed successfully, length: ${freshIdToken.length}`);
        
        // Add a small delay to ensure the token is fully propagated
        await new Promise(resolve => setTimeout(resolve, 1000));
        addDebugInfo('Token propagation delay completed');
      } catch (tokenError) {
        addDebugInfo(`Critical error refreshing ID token: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
        throw new Error('Failed to refresh authentication token for Cloud Function access');
      }
      
      setMessage('Loading your workout history...');
      
      // Trigger initial data load via Cloud Function (FAST - no PR processing)
      const syncResponse = await cloudFunctions.initialDataLoad(user!.uid);
      
      addDebugInfo(`Fetched ${syncResponse.newResultsCount} new results, ${syncResponse.totalResultsCount} total results`);
      
      // NEW: Extract and store Concept2 User ID if we have results
      if (syncResponse.totalResultsCount > 0) {
        setMessage('Setting up your profile...');
        
        try {
          // Get one result to extract the Concept2 User ID
          const allResults = await firebaseService.getAllResults(user!.uid);
          if (allResults.length > 0) {
            const concept2UserId = allResults[0].user_id.toString();
            addDebugInfo(`Extracted Concept2 User ID: ${concept2UserId}`);
            
            // Update user profile with Concept2 User ID
            await firebaseService.createUserProfile(user!.uid, concept2UserId);
            addDebugInfo('User profile updated with Concept2 User ID');
          }
        } catch (profileError) {
          addDebugInfo(`Warning: Could not update user profile: ${profileError instanceof Error ? profileError.message : 'Unknown error'}`);
          // Don't fail the entire flow for profile update issues
        }
      }
      
      // Determine if this is a new user or returning user
      const isNewUser = syncResponse.totalResultsCount === syncResponse.newResultsCount;
      
      if (isNewUser) {
        // NEW USER: Complete PR setup for all results
        addDebugInfo('New user detected - performing complete PR setup');
        setMessage('Organizing your personal bests...');
        
        const prResponse = await cloudFunctions.processAllResultsForPRs(user!.uid);
        addDebugInfo(`Complete PR setup: ${prResponse.totalPRsProcessed} PRs across ${prResponse.activitiesProcessed} activities`);
        
        setStatus('success');
        setMessage(`Welcome to PB Dash! We've imported ${syncResponse.totalResultsCount} workouts and set up ${prResponse.totalPRsProcessed} personal bests.`);
      } else {
        // RETURNING USER: Process new results if any
        addDebugInfo('Returning user detected - processing new results');
        
        if (syncResponse.newResultsCount > 0) {
          setMessage('Organizing your personal bests...');
          
          // For returning users with new results, we need to use processAllResultsForPRs
          // because initialDataLoad doesn't provide newResultIds, and we need to ensure
          // the new results are properly processed for PRs
          addDebugInfo(`Processing ${syncResponse.newResultsCount} new results for PRs`);
          const prResponse = await cloudFunctions.processAllResultsForPRs(user!.uid);
          addDebugInfo(`PR processing completed: ${prResponse.totalPRsProcessed} total PRs across ${prResponse.activitiesProcessed} activities`);
          
          setStatus('success');
          setMessage(`Welcome back! We've added ${syncResponse.newResultsCount} new workouts and updated your personal bests.`);
        } else {
          // No new results
          addDebugInfo('No new results to process');
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
      addDebugInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
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
          
          {/* Debug Information */}
          {(debugInfo.length > 0 && (status === 'error' || import.meta.env.DEV)) && (
            <div className="mb-6 text-left">
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600 hover:text-slate-800">
                  Debug Information ({debugInfo.length} entries)
                </summary>
                <div className="mt-2 p-3 bg-slate-50 rounded border max-h-40 overflow-y-auto">
                  {debugInfo.map((info, index) => (
                    <div key={index} className="text-xs text-slate-600 font-mono">
                      {info}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
          
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