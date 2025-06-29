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
exports.processAllResultsForPRs = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const paceCalculation_1 = require("./paceCalculation");
const db = admin.firestore();
// Define secrets for this function (even though not directly used, 
// the function might need them for future enhancements)
const concept2ClientId = (0, params_1.defineSecret)('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = (0, params_1.defineSecret)('CONCEPT2_CLIENT_SECRET');
exports.processAllResultsForPRs = (0, https_1.onCall)({
    // CRITICAL: Declare the secrets this function uses (for future compatibility)
    secrets: [concept2ClientId, concept2ClientSecret]
}, async (request) => {
    var _a, _b;
    // Enhanced authentication verification
    console.log('Authentication context:', {
        hasAuth: !!request.auth,
        authUid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
        authToken: ((_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) ? 'present' : 'missing'
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
        console.log(`Starting complete PR processing for ALL results for user: ${userId}`);
        // Step 1: Clear all existing PR events (clean slate)
        console.log('Clearing all existing PR events for clean processing');
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        const existingPREvents = await prEventsRef.get();
        if (!existingPREvents.empty) {
            const deleteBatch = db.batch();
            existingPREvents.docs.forEach(doc => {
                deleteBatch.delete(doc.ref);
            });
            await deleteBatch.commit();
            console.log(`Deleted ${existingPREvents.size} existing PR events`);
        }
        // Step 2: Get ALL results for the user
        const resultsRef = db.collection('users').doc(userId).collection('results');
        const allResultsSnapshot = await resultsRef.get();
        if (allResultsSnapshot.empty) {
            console.log('No results found for user');
            return {
                success: true,
                totalPRsProcessed: 0,
                activitiesProcessed: 0
            };
        }
        const allResults = allResultsSnapshot.docs.map(doc => doc.data());
        console.log(`Processing ${allResults.length} total results for PRs`);
        // Step 3: Process all results using smart PR logic
        const { totalPRsProcessed, activitiesProcessed } = await processResultsForPRs(userId, allResults);
        console.log(`Complete PR processing finished for user ${userId}: ${totalPRsProcessed} PRs across ${activitiesProcessed} activities`);
        return {
            success: true,
            totalPRsProcessed,
            activitiesProcessed
        };
    }
    catch (error) {
        console.error('Complete PR processing failed:', error);
        throw new Error(`Complete PR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
/**
 * SMART PR PROCESSING LOGIC
 * This is the core logic used by both processNewPRs and processAllResultsForPRs
 */
async function processResultsForPRs(userId, results) {
    try {
        console.log(`Starting smart PR processing for ${results.length} results for user ${userId}`);
        // Get active PR types for this user from their subcollection
        const prTypesRef = db.collection('users').doc(userId).collection('pr_types');
        const prTypesSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
        let prTypes = prTypesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // If no PR types exist, initialize from template
        if (prTypes.length === 0) {
            console.log('No active PR types found for user, initializing from template');
            await initializeUserPRTypesFromTemplate(userId);
            // Re-fetch after initialization
            const updatedSnapshot = await prTypesRef.where('is_active', '==', true).orderBy('display_order', 'asc').get();
            prTypes = updatedSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            if (prTypes.length === 0) {
                console.log('No PR types available after initialization');
                return { totalPRsProcessed: 0, activitiesProcessed: 0 };
            }
        }
        // Phase 1: Create PR events for all matching results
        const prEventsRef = db.collection('users').doc(userId).collection('pr_events');
        const batch = db.batch();
        let newPRCount = 0;
        const affectedActivities = new Set();
        // Process each result
        for (const result of results) {
            // Check against each PR type
            for (const prType of prTypes) {
                if (matchesPRType(result, prType)) {
                    const resultDate = new Date(result.date);
                    const seasonIdentifier = getSeasonIdentifier(resultDate);
                    const metricValue = getMetricValue(result, prType);
                    // Calculate pace for this result using shared utility
                    const paceFor500m = (0, paceCalculation_1.calculatePaceFor500m)(result.time, result.distance);
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
            console.log(`Phase 1 complete: Created ${newPRCount} PR events for user ${userId}`);
            // Phase 2: Assign scopes for all affected activities
            for (const activityKey of affectedActivities) {
                await assignScopesForActivity(userId, activityKey);
            }
            console.log(`Phase 2 complete: Assigned scopes for ${affectedActivities.size} activities`);
        }
        else {
            console.log('No PR events created');
        }
        return { totalPRsProcessed: newPRCount, activitiesProcessed: affectedActivities.size };
    }
    catch (error) {
        console.error('Error in smart PR processing:', error);
        throw error;
    }
}
/**
 * Initialize user PR types from top-level template collection
 * This copies the standard PR types to the user's subcollection for future customization
 */
async function initializeUserPRTypesFromTemplate(userId) {
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
            batch.set(userPRTypeRef, Object.assign(Object.assign({}, templateData), { created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() }));
            copiedCount++;
        });
        await batch.commit();
        console.log(`Copied ${copiedCount} PR types from template to user ${userId}`);
    }
    catch (error) {
        console.error('Error initializing user PR types from template:', error);
        throw error;
    }
}
/**
 * Assign scopes for a specific activity (OPTIMIZED - only one activity)
 */
async function assignScopesForActivity(userId, activityKey) {
    try {
        console.log(`Assigning scopes for activity ${activityKey} for user ${userId}`);
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
// Helper functions
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
//# sourceMappingURL=processAllResultsForPRs.js.map