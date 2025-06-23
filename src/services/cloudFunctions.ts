import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

// Types for Cloud Function requests/responses
interface SyncRequest {
  userId: string;
  syncType?: 'initial' | 'incremental';
  forceFullSync?: boolean;
}

interface SyncResponse {
  success: boolean;
  newResultsCount: number;
  totalResultsCount: number;
  lastSyncAt: string;
  error?: string;
}

interface IncrementalSyncResponse extends SyncResponse {
  newResultIds: string[];
}

interface ProcessNewPRsRequest {
  userId: string;
  resultIds: string[];
}

interface ProcessNewPRsResponse {
  success: boolean;
  newPRsCount: number;
  processedResultsCount: number;
}

interface ProcessAllResultsForPRsRequest {
  userId: string;
}

interface ProcessAllResultsForPRsResponse {
  success: boolean;
  totalPRsProcessed: number;
  activitiesProcessed: number;
}

interface ProcessNewResultsAndRecalculateRequest {
  userId: string;
}

interface ProcessNewResultsAndRecalculateResponse {
  success: boolean;
  totalPRsProcessed: number;
  activitiesProcessed: number;
  newPREventsCreated: number;
}

export class CloudFunctionsService {
  private static instance: CloudFunctionsService;
  
  private constructor() {}
  
  static getInstance(): CloudFunctionsService {
    if (!CloudFunctionsService.instance) {
      CloudFunctionsService.instance = new CloudFunctionsService();
    }
    return CloudFunctionsService.instance;
  }

  /**
   * Initial data load for first-time authentication (FAST - no PR processing)
   * FIXED: Now uses httpsCallable for proper Firebase authentication flow
   */
  async initialDataLoad(userId: string): Promise<SyncResponse> {
    try {
      console.log('Triggering initial data load via Cloud Function for user:', userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const loadFunction = httpsCallable<{ userId: string }, SyncResponse>(functions, 'initialDataLoadFunction');
      
      const result = await loadFunction({ userId });
      
      console.log('Initial data load completed:', result.data);
      return result.data;
    } catch (error) {
      console.error('Initial data load failed:', error);
      this.handleCloudFunctionError(error);
      throw error;
    }
  }

  /**
   * Incremental sync for subsequent app loads (FAST - no PR processing)
   */
  async incrementalSync(userId: string, forceFullSync: boolean = false): Promise<IncrementalSyncResponse> {
    try {
      console.log('Triggering incremental sync via Cloud Function for user:', userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const syncFunction = httpsCallable<{ userId: string; forceFullSync?: boolean }, IncrementalSyncResponse>(functions, 'incrementalSyncFunction');
      
      const result = await syncFunction({
        userId,
        forceFullSync
      });
      
      console.log('Incremental sync completed:', result.data);
      return result.data;
    } catch (error) {
      console.error('Incremental sync failed:', error);
      this.handleCloudFunctionError(error);
      throw error;
    }
  }

  /**
   * Process specific new results for PRs (EFFICIENT - only new results)
   * Note: This function doesn't exist in Cloud Functions yet, so we use processAllResultsForPRs instead
   */
  async processNewPRs(userId: string, resultIds: string[]): Promise<ProcessNewPRsResponse> {
    try {
      console.log(`Processing new PRs by triggering complete PR processing for user:`, userId);
      
      // Since processNewPRsFunction doesn't exist, use processAllResultsForPRs instead
      const processFunction = httpsCallable<{ userId: string }, ProcessAllResultsForPRsResponse>(functions, 'processAllResultsForPRs');
      
      const result = await processFunction({ userId });
      
      console.log('Complete PR processing completed:', result.data);
      
      // Convert the response format to match expected ProcessNewPRsResponse
      return {
        success: result.data.success,
        newPRsCount: result.data.totalPRsProcessed,
        processedResultsCount: resultIds.length
      };
    } catch (error) {
      console.error('PR processing failed:', error);
      // Don't throw error for PR processing failures - they're non-critical
      console.log('PR processing failed but continuing...');
      return {
        success: false,
        newPRsCount: 0,
        processedResultsCount: 0
      };
    }
  }

  /**
   * Process ALL results for PRs (COMPREHENSIVE - all user results)
   */
  async processAllResultsForPRs(userId: string): Promise<ProcessAllResultsForPRsResponse> {
    try {
      console.log('Triggering complete PR processing for all results via Cloud Function for user:', userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const processFunction = httpsCallable<{ userId: string }, ProcessAllResultsForPRsResponse>(functions, 'processAllResultsForPRs');
      
      const result = await processFunction({ userId });
      
      console.log('Complete PR processing completed:', result.data);
      return result.data;
    } catch (error) {
      console.error('Complete PR processing failed:', error);
      this.handleCloudFunctionError(error);
      throw error;
    }
  }

  /**
   * Process new results and recalculate PRs (SMART - finds new results and recalculates)
   */
  async processNewResultsAndRecalculate(userId: string): Promise<ProcessNewResultsAndRecalculateResponse> {
    try {
      console.log('Triggering smart PR processing and recalculation via Cloud Function for user:', userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const processFunction = httpsCallable<{ userId: string }, ProcessNewResultsAndRecalculateResponse>(functions, 'processNewResultsAndRecalculate');
      
      const result = await processFunction({ userId });
      
      console.log('Smart PR processing and recalculation completed:', result.data);
      return result.data;
    } catch (error) {
      console.error('Smart PR processing and recalculation failed:', error);
      this.handleCloudFunctionError(error);
      throw error;
    }
  }

  /**
   * Legacy sync function (keeping for backward compatibility)
   * @deprecated Use initialDataLoad or incrementalSync instead
   */
  async syncConcept2Data(
    userId: string, 
    syncType: 'initial' | 'incremental' = 'incremental',
    forceFullSync: boolean = false
  ): Promise<SyncResponse> {
    try {
      console.log(`Triggering ${syncType} sync via Cloud Function for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const syncFunction = httpsCallable<SyncRequest, SyncResponse>(functions, 'syncConcept2Data');
      
      const result = await syncFunction({
        userId,
        syncType,
        forceFullSync
      });
      
      console.log('Cloud Function sync completed:', result.data);
      return result.data;
    } catch (error) {
      console.error('Cloud Function sync failed:', error);
      this.handleCloudFunctionError(error);
      throw error;
    }
  }

  /**
   * Handle common Cloud Function errors
   */
  private handleCloudFunctionError(error: any): void {
    if (error instanceof Error) {
      if (error.message.includes('unauthenticated')) {
        throw new Error('REAUTH_REQUIRED');
      } else if (error.message.includes('not-found')) {
        throw new Error('No Concept2 tokens found');
      }
    }
    // Re-throw the original error if it doesn't match specific conditions
    throw error;
  }
}