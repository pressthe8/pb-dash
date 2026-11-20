import { 
    collection, 
    doc, 
    getDocs, 
    query, 
    orderBy, 
    limit,
    setDoc,
    getDoc
  } from 'firebase/firestore';
  import { db } from '../config/firebase';
  import { StoredResult } from '../types/concept2';
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
