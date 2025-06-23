"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncConcept2Data = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const concept2ApiService_1 = require("./concept2ApiService");
const db = admin.firestore();
exports.syncConcept2Data = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { userId, syncType, forceFullSync = false } = data;
    // Verify user can only sync their own data
    if (context.auth.uid !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'User can only sync their own data');
    }
    try {
        console.log(`Starting ${syncType} sync for user: ${userId}`);
        // Get user tokens
        const tokens = await getUserTokens(userId);
        if (!tokens) {
            throw new functions.https.HttpsError('not-found', 'No Concept2 tokens found for user');
        }
        // Initialize Concept2 API service
        const concept2Api = new concept2ApiService_1.Concept2ApiService();
        // Token refresh callback
        const onTokenRefresh = async (newTokens) => {
            await updateUserTokens(userId, newTokens);
        };
        // Determine sync parameters
        let updatedAfter;
        if (syncType === 'incremental' && !forceFullSync && tokens.last_sync_at) {
            updatedAfter = tokens.last_sync_at;
            console.log(`Incremental sync: fetching results updated after ${updatedAfter}`);
        }
        else {
            console.log('Full sync: fetching all results');
        }
        // Fetch results from Concept2 API
        const apiResponse = await concept2Api.fetchAllResults(tokens, onTokenRefresh, updatedAfter);
        console.log(`Fetched ${apiResponse.data.length} results from Concept2 API`);
        // Store results in Firestore (now in user subcollection)
        const newResultsCount = await storeResults(userId, apiResponse.data);
        // Update last sync timestamp
        const lastSyncAt = new Date().toISOString();
        await updateLastSyncTimestamp(userId, lastSyncAt);
        // Get total results count (from user subcollection)
        const totalResultsCount = await getTotalResultsCount(userId);
        console.log(`Sync completed: ${newResultsCount} new results, ${totalResultsCount} total`);
        return {
            success: true,
            newResultsCount,
            totalResultsCount,
            lastSyncAt
        };
    }
    catch (error) {
        console.error('Sync failed:', error);
        if (error instanceof Error) {
            if (error.message === 'REAUTH_REQUIRED') {
                // Clear invalid tokens
                await deleteUserTokens(userId);
                throw new functions.https.HttpsError('unauthenticated', 'Concept2 re-authentication required');
            }
        }
        throw new functions.https.HttpsError('internal', `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
/**
 * Get user tokens from Firestore (still from top-level collection)
 */
async function getUserTokens(userId) {
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
    }
    catch (error) {
        console.error('Error getting user tokens:', error);
        return null;
    }
}
/**
 * Update user tokens in Firestore (still in top-level collection)
 */
async function updateUserTokens(userId, tokens) {
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
/**
 * Update last sync timestamp (still in top-level collection)
 */
async function updateLastSyncTimestamp(userId, lastSyncAt) {
    const docId = `user_${userId}`;
    await db.collection('user_tokens').doc(docId).update({
        last_sync_at: lastSyncAt,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
}
/**
 * Delete user tokens (when re-auth required)
 */
async function deleteUserTokens(userId) {
    const docId = `user_${userId}`;
    await db.collection('user_tokens').doc(docId).update({
        deleted_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
}
/**
 * Store results in user subcollection with duplicate prevention and PR processing
 */
async function storeResults(userId, results) {
    if (results.length === 0) {
        return 0;
    }
    console.log(`Storing results in user subcollection for user: ${userId}`);
    // NEW: Store in user subcollection
    const resultsRef = db.collection('users').doc(userId).collection('results');
    // Get existing results to avoid duplicates
    const existingResultsSnapshot = await resultsRef.get();
    const existingIds = new Set(existingResultsSnapshot.docs.map((doc) => doc.data().id));
    // Filter out existing results
    const newResults = results.filter(result => !existingIds.has(result.id));
    if (newResults.length === 0) {
        console.log('No new results to store');
        return 0;
    }
    // Store results in batches
    const maxBatchSize = 500;
    let totalStored = 0;
    for (let i = 0; i < newResults.length; i += maxBatchSize) {
        const batch = db.batch();
        const batchResults = newResults.slice(i, i + maxBatchSize);
        for (const result of batchResults) {
            // Use result ID as document ID (no need for composite key in subcollection)
            const resultRef = resultsRef.doc(result.id.toString());
            batch.set(resultRef, Object.assign(Object.assign({}, result), { firebase_user_id: userId, raw_data: result, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            totalStored++;
        }
        await batch.commit();
        console.log(`Stored batch of ${batchResults.length} results`);
    }
    // Process new results for PRs
    if (totalStored > 0) {
        console.log('Processing new results for personal records');
        try {
            await processNewResultsForPRs(userId, newResults);
            console.log('PR processing completed successfully');
        }
        catch (prError) {
            console.error('PR processing failed (non-critical):', prError);
            // Don't throw error - result storage was successful
        }
    }
    return totalStored;
}
/**
 * Process new results for Personal Records
 */
async function processNewResultsForPRs(userId, newResults) {
    try {
        console.log(`Processing ${newResults.length} new results for PR detection for user ${userId}`);
        // Get active PR types for this user
        const prTypesRef = db.collection('users').doc(userId).collection('pr_types');
        const prTypesSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
        let prTypes = prTypesSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        // If no PR types exist, initialize defaults
        if (prTypes.length === 0) {
            console.log('No active PR types found for user, initializing defaults');
            await initializeDefaultPRTypes(userId);
            // Re-fetch after initialization
            const updatedSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
            prTypes = updatedSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            if (prTypes.length === 0) {
                console.log('No PR types available after initialization');
                return;
            }
        }
        // Get existing PR events to avoid duplicates
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        const existingPREventsSnapshot = await prEventsRef.get();
        const existingResultIds = new Set(existingPREventsSnapshot.docs.map((doc) => doc.data().results_id));
        const batch = db.batch();
        let newPRCount = 0;
        // Process each new result
        for (const result of newResults) {
            // Skip if we already have a PR event for this result
            if (existingResultIds.has(result.id.toString())) {
                continue;
            }
            // Check against each PR type
            for (const prType of prTypes) {
                if (matchesPRType(result, prType)) {
                    const resultDate = new Date(result.date);
                    const seasonIdentifier = getSeasonIdentifier(resultDate);
                    const metricValue = getMetricValue(result, prType);
                    // Create PR event (no scope assigned yet)
                    const prEventData = {
                        user_id: userId,
                        results_id: result.id.toString(),
                        activity_key: prType.activity_key,
                        pr_scope: [], // Will be assigned in Phase 2
                        metric_type: prType.metric_type,
                        metric_value: metricValue,
                        achieved_at: result.date,
                        season_identifier: seasonIdentifier,
                        previous_record: null, // Will be calculated in Phase 2
                        created_at: admin.firestore.FieldValue.serverTimestamp(),
                        updated_at: admin.firestore.FieldValue.serverTimestamp()
                    };
                    // Use deterministic document ID
                    const docId = `${result.id}_${prType.activity_key}`;
                    const docRef = prEventsRef.doc(docId);
                    batch.set(docRef, prEventData, { merge: true });
                    newPRCount++;
                }
            }
        }
        // Commit batch if we have new PR events
        if (newPRCount > 0) {
            await batch.commit();
            console.log(`Phase 1 complete: Created ${newPRCount} new PR events for user ${userId}`);
            // Proceed to Phase 2: Scope assignment
            await assignPRScopes(userId);
        }
        else {
            console.log('Phase 1 complete: No new PR events created');
        }
    }
    catch (error) {
        console.error('Error in processNewResultsForPRs:', error);
        throw error;
    }
}
/**
 * Initialize default PR types for a user
 */
async function initializeDefaultPRTypes(userId) {
    console.log('Initializing default PR types for user:', userId);
    const prTypesRef = db.collection('users').doc(userId).collection('pr_types');
    const defaultPRTypes = [
        // Distance-based PRs (Time-based metric - fastest time for fixed distance)
        {
            activity_name: "100m Row",
            activity_key: "100m_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 100,
            target_time: null,
            is_active: true,
            display_order: 1
        },
        {
            activity_name: "500m Row",
            activity_key: "500m_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 500,
            target_time: null,
            is_active: true,
            display_order: 2
        },
        {
            activity_name: "1K Row",
            activity_key: "1k_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 1000,
            target_time: null,
            is_active: true,
            display_order: 3
        },
        {
            activity_name: "2K Row",
            activity_key: "2k_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 2000,
            target_time: null,
            is_active: true,
            display_order: 4
        },
        {
            activity_name: "5K Row",
            activity_key: "5k_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 5000,
            target_time: null,
            is_active: true,
            display_order: 5
        },
        {
            activity_name: "6K Row",
            activity_key: "6k_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 6000,
            target_time: null,
            is_active: true,
            display_order: 6
        },
        {
            activity_name: "10K Row",
            activity_key: "10k_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 10000,
            target_time: null,
            is_active: true,
            display_order: 7
        },
        {
            activity_name: "Half Marathon Row",
            activity_key: "half_marathon_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 21097,
            target_time: null,
            is_active: true,
            display_order: 8
        },
        {
            activity_name: "Marathon Row",
            activity_key: "marathon_row",
            sport: "rower",
            metric_type: "time",
            target_distance: 42195,
            target_time: null,
            is_active: true,
            display_order: 9
        },
        // Time-based PRs (Distance-based metric - furthest distance in fixed time)
        {
            activity_name: "1min Row",
            activity_key: "1min_row",
            sport: "rower",
            metric_type: "distance",
            target_distance: null,
            target_time: 60,
            is_active: true,
            display_order: 10
        },
        {
            activity_name: "4min Row",
            activity_key: "4min_row",
            sport: "rower",
            metric_type: "distance",
            target_distance: null,
            target_time: 240,
            is_active: true,
            display_order: 11
        },
        {
            activity_name: "30min Row",
            activity_key: "30min_row",
            sport: "rower",
            metric_type: "distance",
            target_distance: null,
            target_time: 1800,
            is_active: true,
            display_order: 12
        },
        {
            activity_name: "60min Row",
            activity_key: "60min_row",
            sport: "rower",
            metric_type: "distance",
            target_distance: null,
            target_time: 3600,
            is_active: true,
            display_order: 13
        }
    ];
    const batch = db.batch();
    for (const prType of defaultPRTypes) {
        const docRef = prTypesRef.doc(prType.activity_key);
        batch.set(docRef, Object.assign(Object.assign({}, prType), { created_at: new Date().toISOString() }), { merge: true });
    }
    await batch.commit();
    console.log(`All ${defaultPRTypes.length} default PR types initialized for user ${userId}`);
}
/**
 * Assign PR scopes (all-time, season, year)
 */
async function assignPRScopes(userId) {
    try {
        console.log('Starting Phase 2: PR scope assignment for user:', userId);
        // Get all PR events for user
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        const prEventsSnapshot = await prEventsRef.orderBy('achieved_at', 'desc').get();
        const prEvents = prEventsSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        // Group by activity_key
        const eventsByActivity = prEvents.reduce((acc, event) => {
            if (!acc[event.activity_key]) {
                acc[event.activity_key] = [];
            }
            acc[event.activity_key].push(event);
            return acc;
        }, {});
        // Process each activity sequentially
        for (const activityKey of Object.keys(eventsByActivity)) {
            await assignScopesForActivity(userId, activityKey, eventsByActivity[activityKey]);
        }
        console.log('Phase 2 complete: PR scope assignment finished for user:', userId);
    }
    catch (error) {
        console.error('Error in assignPRScopes:', error);
        throw error;
    }
}
/**
 * Assign scopes for a specific activity
 */
async function assignScopesForActivity(userId, activityKey, events) {
    try {
        if (events.length === 0)
            return;
        // Sort events chronologically (oldest first)
        const sortedEvents = [...events].sort((a, b) => new Date(a.achieved_at).getTime() - new Date(b.achieved_at).getTime());
        const isTimeBased = sortedEvents[0].metric_type === "time";
        // Helper function to find best record
        const findBestRecord = (eventList) => {
            return eventList.reduce((best, current) => {
                if (isTimeBased) {
                    // For time-based: lower is better
                    return current.metric_value < best.metric_value ? current : best;
                }
                else {
                    // For distance-based: higher is better
                    return current.metric_value > best.metric_value ? current : best;
                }
            });
        };
        // Step 1: All-time scope
        const allTimeRecord = findBestRecord(sortedEvents);
        // Step 2: Season scopes
        const eventsBySeason = sortedEvents.reduce((acc, event) => {
            if (!acc[event.season_identifier]) {
                acc[event.season_identifier] = [];
            }
            acc[event.season_identifier].push(event);
            return acc;
        }, {});
        const seasonRecords = [];
        for (const [seasonId, seasonEvents] of Object.entries(eventsBySeason)) {
            const seasonRecord = findBestRecord(seasonEvents);
            seasonRecords.push(seasonRecord);
        }
        // Step 3: Year scopes
        const eventsByYear = sortedEvents.reduce((acc, event) => {
            const year = new Date(event.achieved_at).getFullYear().toString();
            if (!acc[year]) {
                acc[year] = [];
            }
            acc[year].push(event);
            return acc;
        }, {});
        const yearRecords = [];
        for (const [year, yearEvents] of Object.entries(eventsByYear)) {
            const yearRecord = findBestRecord(yearEvents);
            yearRecords.push(yearRecord);
        }
        // Step 4: Update all events with their scopes
        const batch = db.batch();
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        for (const event of sortedEvents) {
            const scopes = [];
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
    }
    catch (error) {
        console.error(`Error assigning scopes for activity ${activityKey}:`, error);
        throw error;
    }
}
/**
 * Helper functions for PR processing
 */
function matchesPRType(result, prType) {
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
function getMetricValue(result, prType) {
    if (prType.metric_type === "time") {
        return result.time;
    }
    else {
        return result.distance;
    }
}
function getSeasonIdentifier(date) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-based (0 = January)
    // If January-April, use current year
    // If May-December, use next year
    const seasonEndYear = month < 4 ? year : year + 1;
    return seasonEndYear.toString();
}
/**
 * Get total results count for user (from user subcollection)
 */
async function getTotalResultsCount(userId) {
    const resultsRef = db.collection('users').doc(userId).collection('results');
    const resultsSnapshot = await resultsRef.get();
    return resultsSnapshot.size;
}
//# sourceMappingURL=syncConcept2Data.js.map