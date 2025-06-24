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
exports.deleteUserAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
// Define secrets for this function (for consistency with other functions)
const concept2ClientId = (0, params_1.defineSecret)('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = (0, params_1.defineSecret)('CONCEPT2_CLIENT_SECRET');
exports.deleteUserAccount = (0, https_1.onCall)({
    // CRITICAL: Declare the secrets this function uses (for consistency)
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
    // Verify user can only delete their own account
    if (request.auth.uid !== userId) {
        console.error('Permission denied - auth uid does not match requested userId', {
            authUid: request.auth.uid,
            requestedUserId: userId
        });
        throw new Error('User can only delete their own account');
    }
    try {
        console.log(`Starting account deletion for user: ${userId}`);
        const deletedCollections = [];
        let totalDeletedDocuments = 0;
        // Step 1: Delete user tokens (top-level collection)
        console.log('Deleting user tokens...');
        const tokenDocId = `user_${userId}`;
        const tokenDocRef = db.collection('user_tokens').doc(tokenDocId);
        try {
            await tokenDocRef.delete();
            deletedCollections.push('user_tokens');
            totalDeletedDocuments += 1;
            console.log('User tokens deleted successfully');
        }
        catch (tokenError) {
            console.log('User tokens not found or already deleted');
        }
        // Step 2: Delete all subcollections for the user
        const subcollections = ['results', 'pr_types', 'pr_events'];
        for (const subcollectionName of subcollections) {
            console.log(`Deleting ${subcollectionName} subcollection...`);
            const subcollectionRef = db.collection('users').doc(userId).collection(subcollectionName);
            const subcollectionSnapshot = await subcollectionRef.get();
            if (!subcollectionSnapshot.empty) {
                // Delete in batches to handle large collections
                const batchSize = 500;
                const docs = subcollectionSnapshot.docs;
                for (let i = 0; i < docs.length; i += batchSize) {
                    const batch = db.batch();
                    const batchDocs = docs.slice(i, i + batchSize);
                    batchDocs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    totalDeletedDocuments += batchDocs.length;
                    console.log(`Deleted batch of ${batchDocs.length} documents from ${subcollectionName}`);
                }
                deletedCollections.push(`users/${userId}/${subcollectionName}`);
                console.log(`${subcollectionName} subcollection deleted: ${docs.length} documents`);
            }
            else {
                console.log(`${subcollectionName} subcollection was empty or not found`);
            }
        }
        // Step 3: Delete the user profile document
        console.log('Deleting user profile document...');
        const userDocRef = db.collection('users').doc(userId);
        try {
            await userDocRef.delete();
            deletedCollections.push(`users/${userId}`);
            totalDeletedDocuments += 1;
            console.log('User profile document deleted successfully');
        }
        catch (profileError) {
            console.log('User profile document not found or already deleted');
        }
        // Step 4: Delete Firebase Auth user account
        console.log('Deleting Firebase Auth user account...');
        try {
            await admin.auth().deleteUser(userId);
            console.log('Firebase Auth user account deleted successfully');
        }
        catch (authError) {
            console.error('Error deleting Firebase Auth user:', authError);
            // Don't throw here - Firestore data is already deleted
            console.log('Continuing despite Auth deletion error - user data is cleaned up');
        }
        console.log(`Account deletion completed for user ${userId}:`);
        console.log(`- Collections deleted: ${deletedCollections.join(', ')}`);
        console.log(`- Total documents deleted: ${totalDeletedDocuments}`);
        return {
            success: true,
            deletedCollections,
            deletedDocuments: totalDeletedDocuments
        };
    }
    catch (error) {
        console.error('Account deletion failed:', error);
        throw new Error(`Account deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
//# sourceMappingURL=deleteUserAccount.js.map