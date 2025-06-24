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
exports.incrementalSync = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const concept2ApiService_1 = require("./concept2ApiService");
const paceCalculation_1 = require("./paceCalculation");
const db = admin.firestore();
// Define secrets for this function
const concept2ClientId = (0, params_1.defineSecret)('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = (0, params_1.defineSecret)('CONCEPT2_CLIENT_SECRET');
exports.incrementalSync = (0, https_1.onCall)({
    // CRITICAL: Declare the secrets this function uses
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
        let concept2Api;
        try {
            concept2Api = new concept2ApiService_1.Concept2ApiService();
        }
        catch (configError) {
            console.error('Concept2ApiService initialization failed:', configError);
            throw new Error('Concept2 API configuration missing. Please contact support.');
        }
        // Token refresh callback
        const onTokenRefresh = async (newTokens) => {
            await updateUserTokens(userId, newTokens);
        };
        // Determine sync parameters
        let updatedAfter;
        if (!forceFullSync && tokens.last_sync_at) {
            updatedAfter = tokens.last_sync_at;
            console.log(`Incremental sync: fetching results updated after ${updatedAfter}`);
        }
        else {
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
    }
    catch (error) {
        console.error('Incremental sync failed:', error);
        if (error instanceof Error) {
            if (error.message === 'REAUTH_REQUIRED') {
                await deleteUserTokens(userId);
                throw new Error('Concept2 re-authentication required');
            }
        }
        throw new Error(`Incremental sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
/**
 * Store new results ONLY - no PR processing for speed
 * Returns both count and IDs of new results
 */
async function storeNewResultsOnly(userId, results) {
    if (results.length === 0) {
        return { newResultsCount: 0, newResultIds: [] };
    }
    console.log(`Storing new results in user subcollection for user: ${userId} (no PR processing)`);
    const resultsRef = db.collection('users').doc(userId).collection('results');
    // Get existing results to avoid duplicates
    const existingResultsSnapshot = await resultsRef.get();
    const existingIds = new Set(existingResultsSnapshot.docs.map((doc) => doc.data().id));
    // Filter out existing results
    const newResults = results.filter(result => !existingIds.has(result.id));
    if (newResults.length === 0) {
        console.log('No new results to store');
        return { newResultsCount: 0, newResultIds: [] };
    }
    // Store results in batches (no PR processing)
    const maxBatchSize = 500;
    let totalStored = 0;
    const newResultIds = [];
    for (let i = 0; i < newResults.length; i += maxBatchSize) {
        const batch = db.batch();
        const batchResults = newResults.slice(i, i + maxBatchSize);
        for (const result of batchResults) {
            const resultRef = resultsRef.doc(result.id.toString());
            // Calculate pace for this result using shared utility
            const paceFor500m = (0, paceCalculation_1.calculatePaceFor500m)(result.time, result.distance);
            batch.set(resultRef, Object.assign(Object.assign({}, result), { firebase_user_id: userId, raw_data: result, pace_per_500m: paceFor500m, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            totalStored++;
            newResultIds.push(result.id.toString());
        }
        await batch.commit();
        console.log(`Stored batch of ${batchResults.length} new results (no PR processing)`);
    }
    return { newResultsCount: totalStored, newResultIds };
}
// Shared helper functions (same as initialDataLoad)
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
async function updateLastSyncTimestamp(userId, lastSyncAt) {
    const docId = `user_${userId}`;
    await db.collection('user_tokens').doc(docId).update({
        last_sync_at: lastSyncAt,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
}
async function deleteUserTokens(userId) {
    const docId = `user_${userId}`;
    await db.collection('user_tokens').doc(docId).update({
        deleted_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
}
async function getTotalResultsCount(userId) {
    const resultsRef = db.collection('users').doc(userId).collection('results');
    const resultsSnapshot = await resultsRef.get();
    return resultsSnapshot.size;
}
//# sourceMappingURL=incrementalSync.js.map