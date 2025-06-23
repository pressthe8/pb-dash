import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Concept2ApiService } from './concept2ApiService';
import { OAuthTokens, Concept2Result } from './types';
import { calculatePaceFor500m } from './paceCalculation';

const db = admin.firestore();

// Define secrets for this function
const concept2ClientId = defineSecret('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = defineSecret('CONCEPT2_CLIENT_SECRET');

interface IncrementalSyncRequest {
  userId: string;
  forceFullSync?: boolean;
}

interface IncrementalSyncResponse {
  success: boolean;
  newResultsCount: number;
  totalResultsCount: number;
  lastSyncAt: string;
  newResultIds: string[];
}

export const incrementalSync = onCall<IncrementalSyncRequest>(
  {
    // CRITICAL: Declare the secrets this function uses
    secrets: [concept2ClientId, concept2ClientSecret]
  },
  async (request): Promise<IncrementalSyncResponse> => {
    // Enhanced authentication verification
    console.log('Authentication context:', {
      hasAuth: !!request.auth,
      authUid: request.auth?.uid,
      authToken: request.auth?.token ? 'present' : 'missing'
    });

    if (!request.auth || !request.auth.uid) {
      console.error('Authentication failed - no auth context or uid');
      throw new Error('User must be authenticated');
    }

    const { userId, forceFullSync = false } = request.data;
    
    // Verify user can only sync their own data
    if (request.auth.uid !== userId) {
      console.error('Permission denied - auth uid does not match requested userId', {
        authUid: request.auth.uid,
        requestedUserId: userId
      });
      throw new Error('User can only sync their own data');
    }

    try {
      console.log(`Starting incremental sync for user: ${userId}`);
      
      // Get user tokens
      const tokens = await getUserTokens(userId);
      if (!tokens) {
        throw new Error('No Concept2 tokens found for user');
      }

      // Initialize Concept2 API service with enhanced error handling
      let concept2Api: Concept2ApiService;
      try {
        concept2Api = new Concept2ApiService();
      } catch (configError) {
        console.error('Concept2ApiService initialization failed:', configError);
        throw new Error('Concept2 API configuration missing. Please contact support.');
      }
      
      // Token refresh callback
      const onTokenRefresh = async (newTokens: OAuthTokens) => {
        await updateUserTokens(userId, newTokens);
      };

      // Determine sync parameters
      let updatedAfter: string | undefined;
      if (!forceFullSync && tokens.last_sync_at) {
        updatedAfter = tokens.last_sync_at;
        console.log(`Incremental sync: fetching results updated after ${updatedAfter}`);
      } else {
        console.log('Full sync: fetching all results');
      }

      // Fetch new results from Concept2 API
      const apiResponse = await concept2Api.fetchAllResults(tokens, onTokenRefresh, updatedAfter);
      console.log(`Fetched ${apiResponse.data.length} new results from Concept2 API`);

      // Store new results (FAST - no PR processing)
      const { newResultsCount, newResultIds } = await storeNewResultsOnly(userId, apiResponse.data);
      
      // Update last sync timestamp
      const lastSyncAt = new Date().toISOString();
      await updateLastSyncTimestamp(userId, lastSyncAt);

      // Get total results count
      const totalResultsCount = await getTotalResultsCount(userId);

      console.log(`Incremental sync completed: ${newResultsCount} new results, ${totalResultsCount} total`);

      return {
        success: true,
        newResultsCount,
        totalResultsCount,
        lastSyncAt,
        newResultIds
      };

    } catch (error) {
      console.error('Incremental sync failed:', error);
      
      if (error instanceof Error) {
        if (error.message === 'REAUTH_REQUIRED') {
          await deleteUserTokens(userId);
          throw new Error('Concept2 re-authentication required');
        }
      }
      
      throw new Error(`Incremental sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Store new results ONLY - no PR processing for speed
 * Returns both count and IDs of new results
 */
async function storeNewResultsOnly(userId: string, results: Concept2Result[]): Promise<{ newResultsCount: number; newResultIds: string[] }> {
  if (results.length === 0) {
    return { newResultsCount: 0, newResultIds: [] };
  }

  console.log(`Storing new results in user subcollection for user: ${userId} (no PR processing)`);

  const resultsRef = db.collection('users').doc(userId).collection('results');
  
  // Get existing results to avoid duplicates
  const existingResultsSnapshot = await resultsRef.get();
  const existingIds = new Set(existingResultsSnapshot.docs.map((doc: any) => doc.data().id));
  
  // Filter out existing results
  const newResults = results.filter(result => !existingIds.has(result.id));
  
  if (newResults.length === 0) {
    console.log('No new results to store');
    return { newResultsCount: 0, newResultIds: [] };
  }

  // Store results in batches (no PR processing)
  const maxBatchSize = 500;
  let totalStored = 0;
  const newResultIds: string[] = [];

  for (let i = 0; i < newResults.length; i += maxBatchSize) {
    const batch = db.batch();
    const batchResults = newResults.slice(i, i + maxBatchSize);
    
    for (const result of batchResults) {
      const resultRef = resultsRef.doc(result.id.toString());
      
      // Calculate pace for this result using shared utility
      const paceFor500m = calculatePaceFor500m(result.time, result.distance);
      
      batch.set(resultRef, {
        ...result,
        firebase_user_id: userId,
        raw_data: result,
        pace_per_500m: paceFor500m,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      totalStored++;
      newResultIds.push(result.id.toString());
    }
    
    await batch.commit();
    console.log(`Stored batch of ${batchResults.length} new results (no PR processing)`);
  }

  return { newResultsCount: totalStored, newResultIds };
}

// Shared helper functions (same as initialDataLoad)
async function getUserTokens(userId: string): Promise<OAuthTokens | null> {
  try {
    const docId = `user_${userId}`;
    const tokenDoc = await db.collection('user_tokens').doc(docId).get();
    
    if (!tokenDoc.exists) {
      return null;
    }
    
    const tokenData = tokenDoc.data();
    if (!tokenData || tokenData.deleted_at) {
      return null;
    }
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      created_at: tokenData.created_at,
      last_sync_at: tokenData.last_sync_at || null,
    };
  } catch (error) {
    console.error('Error getting user tokens:', error);
    return null;
  }
}

async function updateUserTokens(userId: string, tokens: OAuthTokens): Promise<void> {
  const docId = `user_${userId}`;
  await db.collection('user_tokens').doc(docId).update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
    scope: tokens.scope,
    created_at: tokens.created_at,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateLastSyncTimestamp(userId: string, lastSyncAt: string): Promise<void> {
  const docId = `user_${userId}`;
  await db.collection('user_tokens').doc(docId).update({
    last_sync_at: lastSyncAt,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteUserTokens(userId: string): Promise<void> {
  const docId = `user_${userId}`;
  await db.collection('user_tokens').doc(docId).update({
    deleted_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getTotalResultsCount(userId: string): Promise<number> {
  const resultsRef = db.collection('users').doc(userId).collection('results');
  const resultsSnapshot = await resultsRef.get();
  return resultsSnapshot.size;
}