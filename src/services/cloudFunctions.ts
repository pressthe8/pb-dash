import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { SlackNotificationPayload } from '../../functions/src/types';

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
  prRepairPending?: boolean;
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

interface DeleteUserAccountRequest {
  userId: string;
}

interface DeleteUserAccountResponse {
  success: boolean;
  deletedCollections: string[];
  deletedDocuments: number;
}

interface UploadPbGridRequest {
  userId: string;
  imageData: string;
}

interface UploadPbGridResponse {
  success: boolean;
  imageUrl: string;
  message?: string;
}

interface SlackNotificationResponse {
  success: boolean;
}

interface Concept2ConnectionStatus {
  connected: boolean;
  reconnectRequired: boolean;
  lastSyncAt: string | null;
}

export interface ReconcileHistoryResult {
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  totalResultsCount: number;
  lastSyncAt: string;
  rebuilt: boolean;
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
   * Enhanced error handling for Cloud Function calls
   */
  private handleCloudFunctionError(error: any, functionName: string): never {
    if (error?.details?.reason === 'REAUTH_REQUIRED') {
      throw new Error('REAUTH_REQUIRED');
    }
    console.error(`Cloud Function ${functionName} failed:`, {
      error,
      errorMessage: error?.message,
      errorCode: error?.code,
      errorDetails: error?.details,
      errorStack: error?.stack
    });

    if (error?.code) {
      switch (error.code) {
        case 'functions/internal':
          throw new Error(`Cloud Function ${functionName} encountered an internal error. This may be due to missing secrets, configuration issues, or runtime errors in the function.`);
        case 'functions/unauthenticated':
          throw new Error('REAUTH_REQUIRED');
        case 'functions/permission-denied':
          throw new Error('Permission denied. Please check your Firebase security rules.');
        case 'functions/not-found':
          throw new Error(`Cloud Function ${functionName} not found. Please ensure it is deployed correctly.`);
        case 'functions/deadline-exceeded':
          throw new Error(`Cloud Function ${functionName} timed out. Please try again.`);
        case 'functions/resource-exhausted':
          throw new Error(`Cloud Function ${functionName} is temporarily unavailable. Please try again later.`);
        default:
          throw new Error(`Cloud Function ${functionName} failed with code ${error.code}: ${error.message}`);
      }
    }

    if (error instanceof Error) {
      if (error.message.includes('unauthenticated')) {
        throw new Error('REAUTH_REQUIRED');
      } else if (error.message.includes('not-found')) {
        throw new Error('No Concept2 tokens found');
      } else if (error.message.includes('INTERNAL')) {
        throw new Error(`Cloud Function ${functionName} internal error. This may indicate missing configuration or secrets.`);
      }
    }

    // Re-throw the original error if it doesn't match specific conditions
    throw error;
  }

  async beginConcept2Connection(redirectUri: string) {
    const begin = httpsCallable<{ redirectUri: string }, { authorizationUrl: string }>(
      functions, 'beginConcept2Connection'
    );
    return (await begin({ redirectUri })).data;
  }

  async completeConcept2Connection(code: string, state: string): Promise<void> {
    await httpsCallable<{ code: string; state: string }>(functions, 'completeConcept2Connection')({ code, state });
  }

  async getConcept2Connection(): Promise<Concept2ConnectionStatus> {
    return (await httpsCallable<void, Concept2ConnectionStatus>(functions, 'getConcept2Connection')()).data;
  }

  async disconnectConcept2(): Promise<void> {
    await httpsCallable(functions, 'disconnectConcept2')();
  }

  async reconcileConcept2History(): Promise<ReconcileHistoryResult> {
    const name = 'reconcileConcept2History';
    try {
      return (await httpsCallable<void, ReconcileHistoryResult>(functions, name, { timeout: 130000 })()).data;
    } catch (error) {
      this.handleCloudFunctionError(error, name);
    }
  }

  /**
   * Initial data load for first-time authentication (FAST - no PR processing)
   * Enhanced with better error handling and debugging
   */
  async initialDataLoad(userId: string): Promise<SyncResponse> {
    const functionName = 'initialDataLoadFunction';
    
    try {
      console.log(`Triggering ${functionName} for user:`, userId);
      console.log('Firebase project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
      console.log('Functions region:', functions.app.options.projectId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const loadFunction = httpsCallable<{ userId: string }, SyncResponse>(functions, functionName, { timeout: 130000 });
      
      console.log(`Calling ${functionName} with userId:`, userId);
      const result = await loadFunction({ userId });
      
      console.log(`${functionName} completed successfully:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }

  /**
   * Incremental sync for subsequent app loads (FAST - no PR processing)
   */
  async incrementalSync(userId: string, forceFullSync: boolean = false): Promise<IncrementalSyncResponse> {
    const functionName = 'incrementalSyncFunction';
    
    try {
      console.log(`Triggering ${functionName} for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const syncFunction = httpsCallable<{ userId: string; forceFullSync?: boolean }, IncrementalSyncResponse>(functions, functionName, { timeout: 130000 });
      
      const result = await syncFunction({
        userId,
        forceFullSync
      });
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }

  /**
   * Process specific new results for PRs (EFFICIENT - only new results)
   * Note: This function doesn't exist in Cloud Functions yet, so we use processAllResultsForPRs instead
   */
  async processNewPRs(userId: string, resultIds: string[]): Promise<ProcessNewPRsResponse> {
    const functionName = 'processAllResultsForPRs';
    
    try {
      console.log(`Processing new PRs by triggering ${functionName} for user:`, userId);
      
      // Since processNewPRsFunction doesn't exist, use processAllResultsForPRs instead
      const processFunction = httpsCallable<{ userId: string }, ProcessAllResultsForPRsResponse>(functions, functionName);
      
      const result = await processFunction({ userId });
      
      console.log(`${functionName} completed:`, result.data);
      
      // Convert the response format to match expected ProcessNewPRsResponse
      return {
        success: result.data.success,
        newPRsCount: result.data.totalPRsProcessed,
        processedResultsCount: resultIds.length
      };
    } catch (error) {
      console.error(`${functionName} failed:`, error);
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
    const functionName = 'processAllResultsForPRs';
    
    try {
      console.log(`Triggering ${functionName} for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const processFunction = httpsCallable<{ userId: string }, ProcessAllResultsForPRsResponse>(functions, functionName);
      
      const result = await processFunction({ userId });
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }

  /**
   * Process new results and recalculate PRs (SMART - finds new results and recalculates)
   */
  async processNewResultsAndRecalculate(userId: string): Promise<ProcessNewResultsAndRecalculateResponse> {
    const functionName = 'processNewResultsAndRecalculate';
    
    try {
      console.log(`Triggering ${functionName} for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const processFunction = httpsCallable<{ userId: string }, ProcessNewResultsAndRecalculateResponse>(functions, functionName);
      
      const result = await processFunction({ userId });
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }

  /**
   * Delete user account and all associated data
   */
  async deleteUserAccount(userId: string): Promise<DeleteUserAccountResponse> {
    const functionName = 'deleteUserAccountFunction';
    
    try {
      console.log(`Triggering ${functionName} for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const deleteFunction = httpsCallable<{ userId: string }, DeleteUserAccountResponse>(functions, functionName);
      
      const result = await deleteFunction({ userId });
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }

  /**
   * Upload PB grid image to Firebase Storage with rate limiting
   */
  async uploadPbGrid(userId: string, imageData: string): Promise<UploadPbGridResponse> {
    const functionName = 'uploadPbGridFunction';
    
    try {
      console.log(`Triggering ${functionName} for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const uploadFunction = httpsCallable<UploadPbGridRequest, UploadPbGridResponse>(functions, functionName);
      
      const result = await uploadFunction({ userId, imageData });
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }

  /**
   * Send a Slack notification via Cloud Function
   */
  async sendSlackNotification(payload: SlackNotificationPayload): Promise<SlackNotificationResponse> {
    const functionName = 'sendSlackNotification';
    
    try {
      console.log(`Triggering ${functionName} with payload:`, payload);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const slackFunction = httpsCallable<SlackNotificationPayload, SlackNotificationResponse>(functions, functionName);
      
      const result = await slackFunction(payload);
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      // Don't use handleCloudFunctionError here since Slack failures shouldn't block user flow
      console.warn('Slack notification failed but continuing with user flow');
      return { success: false };
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
    const functionName = 'syncConcept2Data';
    
    try {
      console.log(`Triggering ${functionName} (${syncType}) for user:`, userId);
      
      // Use Firebase SDK's httpsCallable which automatically handles authentication
      const syncFunction = httpsCallable<SyncRequest, SyncResponse>(functions, functionName);
      
      const result = await syncFunction({
        userId,
        syncType,
        forceFullSync
      });
      
      console.log(`${functionName} completed:`, result.data);
      return result.data;
    } catch (error) {
      console.error(`${functionName} failed:`, error);
      this.handleCloudFunctionError(error, functionName);
    }
  }
}
