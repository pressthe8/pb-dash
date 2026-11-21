import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Import and export all Cloud Functions (v2)
export { beginConcept2Connection, completeConcept2Connection, getConcept2Connection, disconnectConcept2 } from './concept2Connection';
export { initialDataLoad as initialDataLoadFunction } from './initialDataLoad';
export { incrementalSync as incrementalSyncFunction } from './incrementalSync';
export { reconcileConcept2History } from './reconcileConcept2History';
export { processAllResultsForPRs } from './processAllResultsForPRs';
export { processNewResultsAndRecalculate } from './processNewResultsAndRecalculate';
export { deleteUserAccount as deleteUserAccountFunction } from './deleteUserAccount';
export { uploadPbGrid as uploadPbGridFunction } from './uploadPbGrid';
