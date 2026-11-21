import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { Concept2Result } from './types';
import { calculatePaceFor500m } from './paceCalculation';
import { matchesPRType } from './prEligibility';
import { rebuildPersonalBests } from './processAllResultsForPRs';
import { workoutCalendar } from './workoutCalendar';
import { needsPRRebuild, withWorkoutSyncLock, WorkoutSyncLock, workoutSyncTimeoutSeconds } from './workoutSyncLock';

const db = admin.firestore();

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
  { timeoutSeconds: workoutSyncTimeoutSeconds },
  async (request): Promise<ProcessNewResultsAndRecalculateResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
    const userId = request.auth.uid;
    if (request.data?.userId !== userId) {
      throw new HttpsError('permission-denied', 'You can only update your own PBs.');
    }

    return withWorkoutSyncLock(userId, async lock => {
      if (needsPRRebuild(lock.state)) {
        const result = await rebuildPersonalBests(userId, lock);
        await lock.write(tx => { tx.update(lock.ref, { prRepairPending: false, prAppendPending: false, prAppendStarted: false }); });
        return result;
      }
      console.log(`Starting smart PR processing (new results + recalculation) for user: ${userId}`);
      
      // Step 1: Get all results for the user
      const resultsRef = db.collection('users').doc(userId).collection('results');
      const allResultsSnapshot = await resultsRef.get();
      
      if (allResultsSnapshot.empty) {
        console.log('No results found for user');
        await lock.write(tx => { tx.update(lock.ref, { prAppendPending: false }); });
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
      await lock.write(tx => { tx.update(lock.ref, { prAppendStarted: true }); });
      const { newPREventsCreated, activitiesProcessed } = await processNewResultsForPRs(userId, newResults, lock);

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
          await assignScopesForActivity(userId, activityKey, activityEvents as any[], lock);
        }
        
        totalPRsProcessed = updatedPREventsSnapshot.size;
      } else {
        console.log('No new PR events created, no scope recalculation needed');
      }

      console.log(`Smart PR processing completed for user ${userId}: ${newPREventsCreated} new PR events, ${totalPRsProcessed} total PRs across ${activitiesProcessed} activities`);
      await lock.write(tx => { tx.update(lock.ref, { prAppendPending: false, prAppendStarted: false }); });

      return {
        success: true,
        totalPRsProcessed,
        activitiesProcessed,
        newPREventsCreated
      };

    });
  }
);

/**
 * Process new results for PRs (only results that don't have PR events yet)
 */
async function processNewResultsForPRs(userId: string, newResults: Concept2Result[], lock: WorkoutSyncLock): Promise<{ newPREventsCreated: number; activitiesProcessed: number }> {
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
      await initializeUserPRTypesFromTemplate(userId, lock);
      
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
    const newEvents: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];
    const affectedActivities = new Set<string>();

    // Process each new result
    for (const result of newResults) {
      const calendar = workoutCalendar(result.date);
      if (!calendar) continue;

      // Check against each PR type
      for (const prType of prTypes) {
        if (matchesPRType(result, prType)) {
          const metricValue = getMetricValue(result, prType);

          // Calculate pace for this result using shared utility
          const paceFor500m = calculatePaceFor500m(result.time, result.distance);

          // Create PR event (no scope assigned yet)
          const prEventData = {
            user_id: userId,
            results_id: result.id.toString(),
            activity_key: prType.activity_key,
            sport: result.type, // NEW: Add sport field directly from result
            pr_scope: [], // Will be assigned later
            metric_type: prType.metric_type,
            metric_value: metricValue,
            achieved_at: result.date,
            season_identifier: calendar.season,
            previous_record: null,
            pace_per_500m: paceFor500m,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp()
          };

          // Use deterministic document ID
          const docId = `${result.id}_${prType.activity_key}`;
          const docRef = prEventsRef.doc(docId);
          
          newEvents.push({ ref: docRef, data: prEventData });
          affectedActivities.add(prType.activity_key);
        }
      }
    }

    if (newEvents.length > 0) {
      await lock.write(tx => {
        for (const event of newEvents) tx.set(event.ref, event.data, { merge: true });
      });
      console.log(`Created ${newEvents.length} new PR events for user ${userId}`);
    }

    return { newPREventsCreated: newEvents.length, activitiesProcessed: affectedActivities.size };
  } catch (error) {
    console.error('Error processing new results for PRs:', error);
    throw error;
  }
}

/**
 * Initialize user PR types from top-level template collection
 */
async function initializeUserPRTypesFromTemplate(userId: string, lock: WorkoutSyncLock): Promise<void> {
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
    await lock.write(tx => {
      for (const doc of templateSnapshot.docs) {
        tx.set(userPRTypesRef.doc(doc.id), {
          ...doc.data(),
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        });
      }
    });
    
    console.log(`Copied ${templateSnapshot.size} PR types from template to user ${userId}`);
    
  } catch (error) {
    console.error('Error initializing user PR types from template:', error);
    throw error;
  }
}

/**
 * Assign scopes for a specific activity with provided events
 */
async function assignScopesForActivity(userId: string, activityKey: string, events: any[], lock: WorkoutSyncLock): Promise<void> {
  try {
    const sortedEvents = events.flatMap(event => {
      const calendar = workoutCalendar(event.achieved_at);
      return calendar ? [{ event, calendar }] : [];
    }).sort((a, b) => a.calendar.sortKey.localeCompare(b.calendar.sortKey) ||
      Number(a.event.results_id) - Number(b.event.results_id));
    if (sortedEvents.length === 0) return;

    const isTimeBased = sortedEvents[0].event.metric_type === 'time';
    const bestByScope = new Map<string, typeof events[number]>();
    const scopedEvents = sortedEvents.map(({ event, calendar }) => ({
      event,
      season: calendar.season,
      scopes: ['all-time', 'season-' + calendar.season, 'year-' + calendar.year],
    }));

    for (const { event, scopes } of scopedEvents) {
      for (const scope of scopes) {
        const previous = bestByScope.get(scope);
        if (!previous || (isTimeBased
          ? event.metric_value < previous.metric_value
          : event.metric_value > previous.metric_value)) bestByScope.set(scope, event);
      }
    }

    const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
    await lock.write(tx => {
      for (const { event, season, scopes } of scopedEvents) {
        tx.update(prEventsRef.doc(event.id), {
          pr_scope: scopes.filter(scope => bestByScope.get(scope)?.id === event.id),
          season_identifier: season,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    });
    console.log(`Updated scopes for ${sortedEvents.length} events in activity ${activityKey}`);
  } catch (error) {
    console.error(`Error assigning scopes for activity ${activityKey}:`, error);
    throw error;
  }
}

function getMetricValue(result: Concept2Result, prType: any): number {
  if (prType.metric_type === "time") {
    return result.time;
  } else {
    return result.distance;
  }
}
