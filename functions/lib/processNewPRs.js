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
exports.processNewPRs = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.processNewPRs = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { userId, resultIds } = data;
    // Verify user can only process their own data
    if (context.auth.uid !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'User can only process their own data');
    }
    try {
        console.log(`Processing ${resultIds.length} new results for PRs for user: ${userId}`);
        if (resultIds.length === 0) {
            return {
                success: true,
                newPRsProcessed: 0,
                activitiesProcessed: 0
            };
        }
        // Get the specific results to process
        const resultsRef = db.collection('users').doc(userId).collection('results');
        const results = [];
        // Fetch results in batches (Firestore limit)
        const batchSize = 10;
        for (let i = 0; i < resultIds.length; i += batchSize) {
            const batchIds = resultIds.slice(i, i + batchSize);
            const batchPromises = batchIds.map(id => resultsRef.doc(id).get());
            const batchDocs = await Promise.all(batchPromises);
            for (const doc of batchDocs) {
                if (doc.exists) {
                    results.push(doc.data());
                }
            }
        }
        console.log(`Retrieved ${results.length} results to process for PRs`);
        // Process these specific results using smart PR logic
        const { newPRsProcessed, activitiesProcessed } = await processResultsForPRs(userId, results);
        console.log(`Processed ${results.length} results, updated ${newPRsProcessed} PRs across ${activitiesProcessed} activities`);
        return {
            success: true,
            newPRsProcessed,
            activitiesProcessed
        };
    }
    catch (error) {
        console.error('Process new PRs failed:', error);
        throw new functions.https.HttpsError('internal', `Process new PRs failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
/**
 * SMART PR PROCESSING LOGIC
 * This is the same core logic used by both processNewPRs and processAllResultsForPRs
 * The difference is that this version works with existing PR events (doesn't clear them)
 */
async function processResultsForPRs(userId, newResults) {
    try {
        console.log(`Starting smart PR processing for ${newResults.length} new results for user ${userId}`);
        // Get active PR types for this user
        const prTypesRef = db.collection('users').doc(userId).collection('pr_types');
        const prTypesSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
        let prTypes = prTypesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // If no PR types exist, initialize defaults
        if (prTypes.length === 0) {
            console.log('No active PR types found for user, initializing defaults');
            await initializeDefaultPRTypes(userId);
            // Re-fetch after initialization
            const updatedSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
            prTypes = updatedSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            if (prTypes.length === 0) {
                console.log('No PR types available after initialization');
                return { newPRsProcessed: 0, activitiesProcessed: 0 };
            }
        }
        // Get existing PR events to avoid duplicates
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        const existingPREventsSnapshot = await prEventsRef.get();
        const existingResultIds = new Set(existingPREventsSnapshot.docs.map(doc => doc.data().results_id));
        const batch = db.batch();
        let newPRCount = 0;
        const affectedActivities = new Set();
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
                        pr_scope: [], // Will be assigned in scope assignment
                        metric_type: prType.metric_type,
                        metric_value: metricValue,
                        achieved_at: result.date,
                        season_identifier: seasonIdentifier,
                        previous_record: null,
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
            // Only recalculate scopes for affected activities (EFFICIENT)
            for (const activityKey of affectedActivities) {
                await assignScopesForActivity(userId, activityKey);
            }
            console.log(`Recalculated scopes for ${affectedActivities.size} affected activities`);
        }
        else {
            console.log('No new PR events created');
        }
        return { newPRsProcessed: newPRCount, activitiesProcessed: affectedActivities.size };
    }
    catch (error) {
        console.error('Error in smart PR processing:', error);
        throw error;
    }
}
/**
 * Assign scopes for a specific activity (OPTIMIZED - only one activity)
 */
async function assignScopesForActivity(userId, activityKey) {
    try {
        console.log(`Recalculating scopes for activity ${activityKey} for user ${userId}`);
        // Get all PR events for this specific activity
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        const activityEventsSnapshot = await prEventsRef
            .where('activity_key', '==', activityKey)
            .orderBy('achieved_at', 'asc')
            .get();
        const events = activityEventsSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        if (events.length === 0)
            return;
        const isTimeBased = events[0].metric_type === "time";
        // Helper function to find best record
        const findBestRecord = (eventList) => {
            return eventList.reduce((best, current) => {
                if (isTimeBased) {
                    return current.metric_value < best.metric_value ? current : best;
                }
                else {
                    return current.metric_value > best.metric_value ? current : best;
                }
            });
        };
        // Step 1: All-time scope
        const allTimeRecord = findBestRecord(events);
        // Step 2: Season scopes
        const eventsBySeason = events.reduce((acc, event) => {
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
        const eventsByYear = events.reduce((acc, event) => {
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
        for (const event of events) {
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
        console.log(`Updated scopes for ${events.length} events in activity ${activityKey}`);
    }
    catch (error) {
        console.error(`Error assigning scopes for activity ${activityKey}:`, error);
        throw error;
    }
}
// Helper functions (same as processAllResultsForPRs)
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
//# sourceMappingURL=processNewPRs.js.map