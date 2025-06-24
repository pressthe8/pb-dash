import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Define secrets for this function (for consistency with other functions)
const concept2ClientId = defineSecret('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = defineSecret('CONCEPT2_CLIENT_SECRET');

interface DeleteUserAccountRequest {
  userId: string;
}

interface DeleteUserAccountResponse {
  success: boolean;
  deletedCollections: string[];
  deletedDocuments: number;
}

export const deleteUserAccount = onCall<DeleteUserAccountRequest>(
  {
    // CRITICAL: Declare the secrets this function uses (for consistency)
    secrets: [concept2ClientId, concept2ClientSecret]
  },
  async (request): Promise<DeleteUserAccountResponse> => {
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
      
      const deletedCollections: string[] = [];
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
      } catch (tokenError) {
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
        } else {
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
      } catch (profileError) {
        console.log('User profile document not found or already deleted');
      }

      // Step 4: Delete Firebase Auth user account
      console.log('Deleting Firebase Auth user account...');
      try {
        await admin.auth().deleteUser(userId);
        console.log('Firebase Auth user account deleted successfully');
      } catch (authError) {
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

    } catch (error) {
      console.error('Account deletion failed:', error);
      throw new Error(`Account deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);