import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Concept2ApiService, concept2Secrets } from './concept2ApiService';
import { getConcept2Tokens, refreshConcept2Tokens, updateLastSyncTimestamp } from './concept2Tokens';
import { Concept2Result } from './types';
import { calculatePaceFor500m } from './paceCalculation';

const db = admin.firestore();

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
    secrets: concept2Secrets
  },
  async (request): Promise<InitialDataLoadResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
    const userId = request.auth.uid;
    if (request.data?.userId !== userId) {
      throw new HttpsError('permission-denied', 'You can only sync your own workouts.');
    }

    try {
      console.log(`Starting initial data load for user: ${userId}`);
      
      // STEP 1: Initialize user PR types from template
      await initializeUserPRTypes(userId);
      
      const tokens = await getConcept2Tokens(userId);
      const concept2Api = new Concept2ApiService();
      const refresh = (previous: typeof tokens) => refreshConcept2Tokens(userId, previous, concept2Api);

      console.log('Fetching ALL historical results from Concept2 API');
      
      // Fetch ALL results from Concept2 API (no updated_after parameter)
      const apiResponse = await concept2Api.fetchAllResults(tokens, refresh);
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
      if (error instanceof HttpsError) throw error;
      console.error('Concept2 sync failed:', error);
      throw new HttpsError('internal', 'Workout sync failed. Please try again.');
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
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
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
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      
      totalStored++;
    }
    
    await batch.commit();
    console.log(`Stored batch of ${batchResults.length} results (no PR processing)`);
  }

  return totalStored;
}

async function getTotalResultsCount(userId: string): Promise<number> {
  const resultsRef = db.collection('users').doc(userId).collection('results');
  const resultsSnapshot = await resultsRef.get();
  return resultsSnapshot.size;
}
