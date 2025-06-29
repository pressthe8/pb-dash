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

interface InitialDataLoadRequest {
  userId: string;
}

interface InitialDataLoadResponse {
  success: boolean;
  newResultsCount: number;
  totalResultsCount: number;
  lastSyncAt: string;
}

export const initialDataLoad = onCall<InitialDataLoadRequest>(
  {
    // CRITICAL: Declare the secrets this function uses
    secrets: [concept2ClientId, concept2ClientSecret]
  },
  async (request): Promise<InitialDataLoadResponse> => {
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

    const { userId } = request.data;
    
    // Verify user can only sync their own data
    if (request.auth.uid !== userId) {
      console.error('Permission denied - auth uid does not match requested userId', {
        authUid: request.auth.uid,
        requestedUserId: userId
      });
      throw new Error('User can only sync their own data');
    }

    try {
      console.log(`Starting initial data load for user: ${userId}`);
      
      // STEP 1: Initialize user PR types from template
      await initializeUserPRTypes(userId);
      
      // Get user tokens
      const tokens = await getUserTokens(userId);
      if (!tokens) {
        throw new Error('No Concept2 tokens found for user');
      }

      // Initialize Concept2 API service
      const concept2Api = new Concept2ApiService();
      
      // Token refresh callback
      const onTokenRefresh = async (newTokens: OAuthTokens) => {
        await updateUserTokens(userId, newTokens);
      };

      console.log('Fetching ALL historical results from Concept2 API');
      
      // Fetch ALL results from Concept2 API (no updated_after parameter)
      const apiResponse = await concept2Api.fetchAllResults(tokens, onTokenRefresh);
      console.log(`Fetched ${apiResponse.data.length} total results from Concept2 API`);

      // Store results in user subcollection (FAST - no PR processing)
      const newResultsCount = await storeResultsOnly(userId, apiResponse.data);
      
      // Update last sync timestamp
      const lastSyncAt = new Date().toISOString();
      await updateLastSyncTimestamp(userId, lastSyncAt);

      // Get total results count
      const totalResultsCount = await getTotalResultsCount(userId);

      console.log(`Initial data load completed: ${newResultsCount} new results, ${totalResultsCount} total`);

      return {
        success: true,
        newResultsCount,
        totalResultsCount,
        lastSyncAt
      };

    } catch (error) {
      console.error('Initial data load failed:', error);
      
      if (error instanceof Error) {
        if (error.message === 'REAUTH_REQUIRED') {
          await deleteUserTokens(userId);
          throw new Error('Concept2 re-authentication required');
        }
      }
      
      throw new Error(`Initial data load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Initialize user PR types from top-level template collection
 * This copies the standard PR types to the user's subcollection for future customization
 */
async function initializeUserPRTypes(userId: string): Promise<void> {
  try {
    console.log('Initializing PR types for user:', userId);
    
    const userPRTypesRef = db.collection('users').doc(userId).collection('pr_types');
    
    // Check if user already has PR types
    const existingPRTypes = await userPRTypesRef.limit(1).get();
    if (!existingPRTypes.empty) {
      console.log('User already has PR types, skipping initialization');
      return;
    }
    
    // Get template PR types from top-level collection
    const templatePRTypesRef = db.collection('pr_types');
    const templateSnapshot = await templatePRTypesRef.get();
    
    // Copy template PR types to user subcollection
    const batch = db.batch();
    let copiedCount = 0;
    
    templateSnapshot.docs.forEach(doc => {
      const templateData = doc.data();
      const userPRTypeRef = userPRTypesRef.doc(doc.id);
      
      batch.set(userPRTypeRef, {
        ...templateData,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      copiedCount++;
    });
    
    await batch.commit();
    console.log(`Copied ${copiedCount} PR types from template to user ${userId}`);
    
  } catch (error) {
    console.error('Error initializing user PR types:', error);
    throw error;
  }
}

/**
 * Store results ONLY - no PR processing for speed
 */
async function storeResultsOnly(userId: string, results: Concept2Result[]): Promise<number> {
  if (results.length === 0) {
    return 0;
  }

  console.log(`Storing ${results.length} results in user subcollection for user: ${userId} (no PR processing)`);

  const resultsRef = db.collection('users').doc(userId).collection('results');
  
  // Get existing results to avoid duplicates
  const existingResultsSnapshot = await resultsRef.get();
  const existingIds = new Set(existingResultsSnapshot.docs.map((doc: any) => doc.data().id));
  
  // Filter out existing results
  const newResults = results.filter(result => !existingIds.has(result.id));
  
  if (newResults.length === 0) {
    console.log('No new results to store');
    return 0;
  }

  // Store results in batches (no PR processing)
  const maxBatchSize = 500;
  let totalStored = 0;

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
    }
    
    await batch.commit();
    console.log(`Stored batch of ${batchResults.length} results (no PR processing)`);
  }

  return totalStored;
}

// Shared helper functions
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