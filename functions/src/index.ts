import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Import and export all Cloud Functions (v2)
export { initialDataLoad as initialDataLoadFunction } from './initialDataLoad';
export { incrementalSync as incrementalSyncFunction } from './incrementalSync';
export { processAllResultsForPRs } from './processAllResultsForPRs';
export { processNewResultsAndRecalculate } from './processNewResultsAndRecalculate';