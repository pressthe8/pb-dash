import { 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit,
    writeBatch,
    serverTimestamp,
    setDoc,
    deleteField,
    getDoc
  } from 'firebase/firestore';
  import { db } from '../config/firebase';
  import { StoredResult, OAuthTokens, Concept2Result } from '../types/concept2';
  import { UserProfile } from '../types/personalRecords';

  export class FirebaseService {
    private static instance: FirebaseService;
    public db = db; // Make db accessible for ProfilePage
    
    private constructor() {}
    
    static getInstance(): FirebaseService {
      if (!FirebaseService.instance) {
        FirebaseService.instance = new FirebaseService();
      }
      return FirebaseService.instance;
    }

    /**
     * Create or update user profile
     */
    async createUserProfile(firebaseUserId: string, concept2UserId?: string): Promise<void> {
      try {
        console.log('Creating/updating user profile for:', firebaseUserId, 'with Concept2 User ID:', concept2UserId);
        const userDocRef = doc(db, 'users', firebaseUserId);
        
        // Check if profile already exists
        const existingProfile = await getDoc(userDocRef);
        
        const profileData: Partial<UserProfile> = {
          last_updated: new Date().toISOString()
        };

        // Only set these fields if creating new profile
        if (!existingProfile.exists()) {
          profileData.user_id = concept2UserId || '';
          profileData.created_at = new Date().toISOString();
          profileData.season_view = true;  // Default to season view
          profileData.private = true;      // Default to private
          
          console.log('Creating new user profile with data:', profileData);
        } else {
          console.log('Updating existing user profile');
          
          // If we have a Concept2 User ID, always update it (even for existing profiles)
          if (concept2UserId) {
            profileData.user_id = concept2UserId;
            console.log('Updating existing profile with Concept2 User ID:', concept2UserId);
          }
        }

        await setDoc(userDocRef, profileData, { merge: true });
        console.log('User profile created/updated successfully with data:', profileData);
      } catch (error) {
        console.error('Error creating user profile:', error);
        throw error;
      }
    }

    /**
     * Get user profile
     */
    async getUserProfile(firebaseUserId: string): Promise<UserProfile | null> {
      try {
        console.log('Getting user profile for:', firebaseUserId);
        const userDocRef = doc(db, 'users', firebaseUserId);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          console.log('No user profile found');
          return null;
        }
        
        const profileData = userDoc.data() as UserProfile;
        console.log('Retrieved user profile:', profileData);
        return profileData;
      } catch (error) {
        console.error('Error getting user profile:', error);
        throw error;
      }
    }

    /**
     * Store OAuth tokens for a user (keeping in top-level collection)
     */
    async storeTokens(firebaseUserId: string, tokens: OAuthTokens): Promise<void> {
      try {
        console.log('Starting token storage for user:', firebaseUserId);
        const tokensRef = collection(db, 'user_tokens');
        
        // Use a deterministic document ID based on user ID to avoid duplicates
        // Reason: This ensures we always update the same document for a user
        const docId = `user_${firebaseUserId}`;
        const tokenDocRef = doc(tokensRef, docId);
        
        const tokenData = {
          firebase_user_id: firebaseUserId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          token_type: tokens.token_type,
          scope: tokens.scope || '', // Reason: Default to empty string if scope is undefined to prevent Firestore errors
          created_at: tokens.created_at,
          updated_at: serverTimestamp(),
          last_sync_at: null, // Reason: Initialize as null, will be set after first successful sync
          // Reason: Explicitly remove any deleted_at field when storing new tokens
          deleted_at: deleteField()
        };

        console.log('Using setDoc to create/update token document with ID:', docId);
        // Use setDoc with merge: true to allow deleteField() to work properly
        await setDoc(tokenDocRef, tokenData, { merge: true });
        console.log('Token document created/updated successfully');

        // Create user profile if it doesn't exist
        await this.createUserProfile(firebaseUserId);
      } catch (error) {
        console.error('Error in storeTokens:', error);
        throw error;
      }
    }

    /**
     * Update OAuth tokens for a user (used during token refresh)
     * Reason: Separate method to make token refresh operations explicit
     */
    async updateTokens(firebaseUserId: string, tokens: OAuthTokens): Promise<void> {
      try {
        console.log('Updating tokens for user:', firebaseUserId);
        const tokensRef = collection(db, 'user_tokens');
        const docId = `user_${firebaseUserId}`;
        const tokenDocRef = doc(tokensRef, docId);
        
        const tokenData = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          token_type: tokens.token_type,
          scope: tokens.scope || '',
          created_at: tokens.created_at,
          updated_at: serverTimestamp(),
          // Reason: Ensure deleted_at is removed when updating with fresh tokens
          deleted_at: deleteField()
        };

        await setDoc(tokenDocRef, tokenData, { merge: true });
        console.log('Tokens updated successfully');
      } catch (error) {
        console.error('Error in updateTokens:', error);
        throw error;
      }
    }

    /**
     * Update last sync timestamp for a user
     * Reason: Track when we last successfully synced data to enable efficient incremental sync
     */
    async updateLastSyncTimestamp(firebaseUserId: string, syncTimestamp?: string): Promise<void> {
      try {
        console.log('Updating last sync timestamp for user:', firebaseUserId);
        const tokensRef = collection(db, 'user_tokens');
        const docId = `user_${firebaseUserId}`;
        const tokenDocRef = doc(tokensRef, docId);
        
        // Reason: Use provided timestamp or current time in ISO format for Concept2 API compatibility
        const lastSyncAt = syncTimestamp || new Date().toISOString();
        
        await setDoc(tokenDocRef, {
          last_sync_at: lastSyncAt,
          updated_at: serverTimestamp()
        }, { merge: true });
        
        console.log('Last sync timestamp updated to:', lastSyncAt);
      } catch (error) {
        console.error('Error updating last sync timestamp:', error);
        throw error;
      }
    }

    /**
     * Get OAuth tokens for a user (still from top-level collection)
     */
    async getTokens(firebaseUserId: string): Promise<(OAuthTokens & { last_sync_at?: string }) | null> {
      try {
        console.log('Getting tokens for user:', firebaseUserId);
        const tokensRef = collection(db, 'user_tokens');
        
        // Reason: Use deterministic document ID for direct lookup instead of query
        // This is more efficient and avoids potential query issues
        const docId = `user_${firebaseUserId}`;
        const tokenDocRef = doc(tokensRef, docId);
        
        // Try direct document lookup first
        try {
          const tokenDoc = await getDoc(tokenDocRef);
          
          if (!tokenDoc.exists()) {
            console.log('No token document found for user');
            return null;
          }
          
          const tokenData = tokenDoc.data();
          
          // Check if tokens are marked as deleted
          if (tokenData.deleted_at) {
            console.log('Tokens are marked as deleted');
            return null;
          }
          
          console.log('Tokens retrieved successfully via direct lookup');
          return {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            token_type: tokenData.token_type,
            scope: tokenData.scope,
            created_at: tokenData.created_at,
            last_sync_at: tokenData.last_sync_at || null, // Reason: Include last sync timestamp for incremental sync
          };
        } catch (directLookupError) {
          console.log('Direct lookup failed, falling back to query method');
          
          // Fallback to query method for backward compatibility
          const tokensQuery = query(tokensRef, where('firebase_user_id', '==', firebaseUserId));
          const tokensSnapshot = await getDocs(tokensQuery);
          
          if (tokensSnapshot.empty) {
            console.log('No tokens found for user via query');
            return null;
          }
          
          const tokenData = tokensSnapshot.docs[0].data();
          
          // Check if tokens are marked as deleted
          if (tokenData.deleted_at) {
            console.log('Tokens are marked as deleted');
            return null;
          }
          
          console.log('Tokens retrieved successfully via query');
          return {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            token_type: tokenData.token_type,
            scope: tokenData.scope,
            created_at: tokenData.created_at,
            last_sync_at: tokenData.last_sync_at || null, // Reason: Include last sync timestamp for incremental sync
          };
        }
      } catch (error) {
        console.error('Error in getTokens:', error);
        throw error;
      }
    }

    /**
     * Delete OAuth tokens for a user (used when refresh token expires)
     * Reason: Clean up invalid tokens to force re-authentication
     */
    async deleteTokens(firebaseUserId: string): Promise<void> {
      try {
        console.log('Deleting tokens for user:', firebaseUserId);
        const tokensRef = collection(db, 'user_tokens');
        const docId = `user_${firebaseUserId}`;
        const tokenDocRef = doc(tokensRef, docId);
        
        await setDoc(tokenDocRef, {
          firebase_user_id: firebaseUserId,
          deleted_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }, { merge: true });
        
        console.log('Tokens marked as deleted');
      } catch (error) {
        console.error('Error in deleteTokens:', error);
        throw error;
      }
    }

    /**
     * Store rowing results with batch writing for efficiency
     * Now stores in user subcollection - NO PR processing (handled by Cloud Functions)
     */
    async storeResults(firebaseUserId: string, results: Concept2Result[]): Promise<void> {
      try {
        console.log('Starting results storage for user:', firebaseUserId, 'with', results.length, 'results');
        
        // Store in user subcollection
        const resultsRef = collection(db, 'users', firebaseUserId, 'results');
        
        // Get existing results to avoid duplicates
        console.log('Checking for existing results');
        const existingResults = await getDocs(resultsRef);
        const existingIds = new Set(existingResults.docs.map(doc => doc.data().id));
        console.log('Found', existingIds.size, 'existing results');
        
        // Filter out existing results to get only new ones
        const newResults = results.filter(result => !existingIds.has(result.id));
        console.log('Found', newResults.length, 'new results to store');
        
        if (newResults.length === 0) {
          console.log('No new results to store');
          return;
        }
        
        let newResultsCount = 0;
        const maxBatchSize = 500;
        
        // Process results in batches
        for (let i = 0; i < newResults.length; i += maxBatchSize) {
          const batch = writeBatch(db);
          const batchResults = newResults.slice(i, i + maxBatchSize);
          let batchCount = 0;
          
          for (const result of batchResults) {
            const resultData: Omit<StoredResult, 'created_at' | 'updated_at'> = {
              ...result,
              firebase_user_id: firebaseUserId,
              raw_data: result,
            };
            
            // Use result ID as document ID (no need for composite key in subcollection)
            const resultDocRef = doc(resultsRef, result.id.toString());
            
            batch.set(resultDocRef, {
              ...resultData,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
            }, { merge: true });
            
            batchCount++;
            newResultsCount++;
          }
          
          // Commit batch if it has operations
          if (batchCount > 0) {
            console.log('Committing batch of', batchCount, 'results');
            await batch.commit();
          }
        }
        
        console.log('Results storage completed. New results added:', newResultsCount);
        
        // Update last sync timestamp with the most recent result date
        if (newResultsCount > 0) {
          // Reason: Find the most recent result date to use as the last sync timestamp
          const mostRecentResult = newResults.reduce((latest, current) => 
            new Date(current.date) > new Date(latest.date) ? current : latest
          );
          
          await this.updateLastSyncTimestamp(firebaseUserId, mostRecentResult.date);
          
          // NOTE: PR processing is now handled by Cloud Functions, not here
          console.log('Results stored successfully. PR processing will be handled by Cloud Functions.');
        }
      } catch (error) {
        console.error('Error in storeResults:', error);
        throw error;
      }
    }

    /**
     * Get recent results for a user from subcollection
     */
    async getRecentResults(firebaseUserId: string, limitCount: number = 20): Promise<StoredResult[]> {
      try {
        console.log('Getting recent results for user:', firebaseUserId, 'limit:', limitCount);
        
        const resultsRef = collection(db, 'users', firebaseUserId, 'results');
        const resultsQuery = query(
          resultsRef,
          orderBy('date', 'desc'),
          limit(limitCount)
        );
        
        const resultsSnapshot = await getDocs(resultsQuery);
        const results = resultsSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.data().id,
        })) as StoredResult[];
        
        console.log('Retrieved', results.length, 'recent results');
        return results;
      } catch (error) {
        console.error('Error in getRecentResults:', error);
        throw error;
      }
    }

    /**
     * Get all results for a user from subcollection
     */
    async getAllResults(firebaseUserId: string): Promise<StoredResult[]> {
      try {
        console.log('Getting all results for user:', firebaseUserId);
        
        const resultsRef = collection(db, 'users', firebaseUserId, 'results');
        const resultsQuery = query(
          resultsRef,
          orderBy('date', 'desc')
        );
        
        const resultsSnapshot = await getDocs(resultsQuery);
        const results = resultsSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.data().id,
        })) as StoredResult[];
        
        console.log('Retrieved', results.length, 'total results');
        return results;
      } catch (error) {
        console.error('Error in getAllResults:', error);
        throw error;
      }
    }

    /**
     * Get results count for a user from subcollection
     */
    async getResultsCount(firebaseUserId: string): Promise<number> {
      try {
        console.log('Getting results count for user:', firebaseUserId);
        
        const resultsRef = collection(db, 'users', firebaseUserId, 'results');
        const resultsSnapshot = await getDocs(resultsRef);
        const count = resultsSnapshot.size;
        
        console.log('Results count:', count);
        return count;
      } catch (error) {
        console.error('Error in getResultsCount:', error);
        throw error;
      }
    }
  }