import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Concept2Result } from './types';
import { calculatePaceFor500m } from './paceCalculation';

const db = admin.firestore();

// Define secrets for this function (even though not directly used, 
// the function might need them for future enhancements)
const concept2ClientId = defineSecret('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = defineSecret('CONCEPT2_CLIENT_SECRET');

interface ProcessNewResultsAndRecalculateRequest {
  userId: string;
}

interface ProcessNewResultsAndRecalculateResponse {
  success: boolean;
  totalPRsProcessed: number;
  activitiesProcessed: number;
  newPREventsCreated: number;
}

export const processNewResultsAndRecalculate = onCall<ProcessNewResultsAndRecalculateRequest>(
  {
    // CRITICAL: Declare the secrets this function uses (for future compatibility)
    secrets: [concept2ClientId, concept2ClientSecret]
  },
  async (request): Promise<ProcessNewResultsAndRecalculateResponse> => {
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
    
    // Verify user can only process their own data
    if (request.auth.uid !== userId) {
      console.error('Permission denied - auth uid does not match requested userId', {
        authUid: request.auth.uid,
        requestedUserId: userId
      });
      throw new Error('User can only process their own data');
    }

    try {
      console.log(`Starting smart PR processing (new results + recalculation) for user: ${userId}`);
      
      // Step 1: Get all results for the user
      const resultsRef = db.collection('users').doc(userId).collection('results');
      const allResultsSnapshot = await resultsRef.get();
      
      if (allResultsSnapshot.empty) {
        console.log('No results found for user');
        return {
          success: true,
          totalPRsProcessed: 0,
          activitiesProcessed: 0,
          newPREventsCreated: 0
        };
      }

      const allResults = allResultsSnapshot.docs.map(doc => doc.data() as Concept2Result);
      console.log(`Found ${allResults.length} total results for user`);

      // Step 2: Get existing PR events
      const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
      const existingPREventsSnapshot = await prEventsRef.get();
      const existingResultIds = new Set(existingPREventsSnapshot.docs.map(doc => doc.data().results_id));
      
      console.log(`Found ${existingPREventsSnapshot.size} existing PR events`);

      // Step 3: Find results that don't have PR events yet (new results)
      const newResults = allResults.filter(result => !existingResultIds.has(result.id.toString()));
      console.log(`Found ${newResults.length} new results that need PR processing`);

      // Step 4: Process new results for PRs using smart PR logic
      const { newPREventsCreated, activitiesProcessed } = await processNewResultsForPRs(userId, newResults);

      // Step 5: If we created new PR events, recalculate scopes for affected activities
      let totalPRsProcessed = existingPREventsSnapshot.size + newPREventsCreated;
      
      if (newPREventsCreated > 0) {
        console.log(`Created ${newPREventsCreated} new PR events, recalculating scopes for affected activities`);
        
        // Get all activities that have PR events (including new ones)
        const updatedPREventsSnapshot = await prEventsRef.get();
        const allPREvents = updatedPREventsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        const activitiesByKey = allPREvents.reduce((acc: any, event: any) => {
          if (!acc[event.activity_key]) {
            acc[event.activity_key] = [];
          }
          acc[event.activity_key].push(event);
          return acc;
        }, {} as Record<string, any[]>);

        // Recalculate scopes for all activities (efficient since we only update scopes)
        for (const [activityKey, activityEvents] of Object.entries(activitiesByKey)) {
          await assignScopesForActivity(userId, activityKey, activityEvents as any[]);
        }
        
        totalPRsProcessed = updatedPREventsSnapshot.size;
      } else {
        console.log('No new PR events created, no scope recalculation needed');
      }

      console.log(`Smart PR processing completed for user ${userId}: ${newPREventsCreated} new PR events, ${totalPRsProcessed} total PRs across ${activitiesProcessed} activities`);

      return {
        success: true,
        totalPRsProcessed,
        activitiesProcessed,
        newPREventsCreated
      };

    } catch (error) {
      console.error('Smart PR processing failed:', error);
      throw new Error(`Smart PR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Process new results for PRs (only results that don't have PR events yet)
 */
async function processNewResultsForPRs(userId: string, newResults: Concept2Result[]): Promise<{ newPREventsCreated: number; activitiesProcessed: number }> {
  if (newResults.length === 0) {
    return { newPREventsCreated: 0, activitiesProcessed: 0 };
  }

  try {
    console.log(`Processing ${newResults.length} new results for PRs for user ${userId}`);
    
    // Get active PR types for this user from their subcollection
    const prTypesRef = db.collection('users').doc(userId).collection('pr_types');
    const prTypesSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
    
    let prTypes = prTypesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as any));

    // If no PR types exist, initialize from template
    if (prTypes.length === 0) {
      console.log('No active PR types found for user, initializing from template');
      await initializeUserPRTypesFromTemplate(userId);
      
      // Re-fetch after initialization
      const updatedSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
      prTypes = updatedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as any));
      
      if (prTypes.length === 0) {
        console.log('No PR types available after initialization');
        return { newPREventsCreated: 0, activitiesProcessed: 0 };
      }
    }

    // Create PR events for new results only
    const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
    const batch = db.batch();
    let newPRCount = 0;
    const affectedActivities = new Set<string>();

    // Process each new result
    for (const result of newResults) {
      // Check against each PR type
      for (const prType of prTypes) {
        if (matchesPRType(result, prType)) {
          const resultDate = new Date(result.date);
          const seasonIdentifier = getSeasonIdentifier(resultDate);
          const metricValue = getMetricValue(result, prType);

          // Calculate pace for this result using shared utility
          const paceFor500m = calculatePaceFor500m(result.time, result.distance);

          // Create PR event (no scope assigned yet)
          const prEventData = {
            user_id: userId,
            results_id: result.id.toString(),
            activity_key: prType.activity_key,
            pr_scope: [], // Will be assigned later
            metric_type: prType.metric_type,
            metric_value: metricValue,
            achieved_at: result.date,
            season_identifier: seasonIdentifier,
            previous_record: null,
            pace_per_500m: paceFor500m,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          };

          // Use deterministic document ID
          const docId = `${result.id}_${prType.activity_key}`;
          const docRef = prEventsRef.doc(docId);
          
          batch.set(docRef, prEventData, { merge: true });
          newPRCount++;
          affectedActivities.add(prType.activity_key);
        }
      }
    }

    // Commit batch if we have new PR events
    if (newPRCount > 0) {
      await batch.commit();
      console.log(`Created ${newPRCount} new PR events for user ${userId}`);
    }

    return { newPREventsCreated: newPRCount, activitiesProcessed: affectedActivities.size };
  } catch (error) {
    console.error('Error processing new results for PRs:', error);
    throw error;
  }
}

/**
 * Initialize user PR types from top-level template collection
 */
async function initializeUserPRTypesFromTemplate(userId: string): Promise<void> {
  try {
    console.log('Initializing PR types from template for user:', userId);
    
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
    console.error('Error initializing user PR types from template:', error);
    throw error;
  }
}

/**
 * Assign scopes for a specific activity with provided events
 */
async function assignScopesForActivity(userId: string, activityKey: string, events: any[]): Promise<void> {
  try {
    if (events.length === 0) return;

    // Sort events chronologically (oldest first)
    const sortedEvents = [...events].sort((a: any, b: any) => 
      new Date(a.achieved_at).getTime() - new Date(b.achieved_at).getTime()
    );

    const isTimeBased = sortedEvents[0].metric_type === "time";
    
    // Helper function to find best record
    const findBestRecord = (eventList: any[]): any => {
      return eventList.reduce((best: any, current: any) => {
        if (isTimeBased) {
          // For time-based: lower is better
          return current.metric_value < best.metric_value ? current : best;
        } else {
          // For distance-based: higher is better
          return current.metric_value > best.metric_value ? current : best;
        }
      });
    };

    // Step 1: All-time scope
    const allTimeRecord = findBestRecord(sortedEvents);
    
    // Step 2: Season scopes
    const eventsBySeason = sortedEvents.reduce((acc: any, event: any) => {
      if (!acc[event.season_identifier]) {
        acc[event.season_identifier] = [];
      }
      acc[event.season_identifier].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    const seasonRecords: any[] = [];
    for (const [seasonId, seasonEvents] of Object.entries(eventsBySeason)) {
      const seasonRecord = findBestRecord(seasonEvents as any[]);
      seasonRecords.push(seasonRecord);
    }

    // Step 3: Year scopes
    const eventsByYear = sortedEvents.reduce((acc: any, event: any) => {
      const year = new Date(event.achieved_at).getFullYear().toString();
      if (!acc[year]) {
        acc[year] = [];
      }
      acc[year].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    const yearRecords: any[] = [];
    for (const [year, yearEvents] of Object.entries(eventsByYear)) {
      const yearRecord = findBestRecord(yearEvents as any[]);
      yearRecords.push(yearRecord);
    }

    // Step 4: Update all events with their scopes
    const batch = db.batch();
    const prEventsRef = db.collection('users').doc(userId).collection('pr_events');

    for (const event of sortedEvents) {
      const scopes: string[] = [];
      
      // Check if this is the all-time record
      if (event.id === allTimeRecord.id) {
        scopes.push("all-time");
      }
      
      // Check if this is a season record
      if (seasonRecords.some(record => record.id === event.id)) {
        scopes.push(`season-${event.season_identifier}`);
      }
      
      // Check if this is a year record
      const eventYear = new Date(event.achieved_at).getFullYear().toString();
      if (yearRecords.some(record => record.id === event.id)) {
        scopes.push(`year-${eventYear}`);
      }

      // Update the event with new scopes
      const docRef = prEventsRef.doc(event.id);
      batch.update(docRef, {
        pr_scope: scopes,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    console.log(`Updated scopes for ${sortedEvents.length} events in activity ${activityKey}`);
  } catch (error) {
    console.error(`Error assigning scopes for activity ${activityKey}:`, error);
    throw error;
  }
}

// Helper functions
function matchesPRType(result: Concept2Result, prType: any): boolean {
  // Must match sport type
  if (result.type !== prType.sport) {
    return false;
  }

  // Time-based PR: exact distance match
  if (prType.metric_type === "time" && prType.target_distance !== null) {
    return result.distance === prType.target_distance;
  }

  // Distance-based PR: exact time match
  if (prType.metric_type === "distance" && prType.target_time !== null) {
    return result.time === prType.target_time;
  }

  return false;
}

function getMetricValue(result: Concept2Result, prType: any): number {
  if (prType.metric_type === "time") {
    return result.time;
  } else {
    return result.distance;
  }
}

function getSeasonIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based (0 = January)
  
  // If January-April, use current year
  // If May-December, use next year
  const seasonEndYear = month < 4 ? year : year + 1;
  return seasonEndYear.toString();
}