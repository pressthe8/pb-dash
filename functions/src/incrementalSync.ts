import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Concept2ApiService, concept2Secrets } from './concept2ApiService';
import { concept2TokenRef, getConcept2Tokens, refreshConcept2Tokens } from './concept2Tokens';
import { countWorkouts, saveNewWorkouts } from './workoutStorage';
import { withWorkoutSyncLock, workoutSyncTimeoutSeconds } from './workoutSyncLock';

interface IncrementalSyncRequest {
  userId: string;
  forceFullSync?: boolean;
}

export const incrementalSync = onCall<IncrementalSyncRequest>(
  { secrets: concept2Secrets, timeoutSeconds: workoutSyncTimeoutSeconds },
  async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
    const uid = request.auth.uid;
    if (request.data?.userId !== uid) throw new HttpsError('permission-denied', 'You can only sync your own workouts.');

    return withWorkoutSyncLock(uid, async lock => {
      const startedAt = new Date();
      const tokens = await getConcept2Tokens(uid);
      const api = new Concept2ApiService();
      const session = api.openSession(tokens, previous => refreshConcept2Tokens(uid, previous, api));
      const cursor = Date.parse(lock.state.cursorAt || tokens.last_sync_at || '');
      // Overlap the previous sync start to account for second precision and changes during paging.
      const since = !request.data.forceFullSync && Number.isFinite(cursor)
        ? new Date(Math.min(cursor, startedAt.getTime()) - 120000).toISOString().slice(0, 19).replace('T', ' ')
        : undefined;

      const newResultIds = await saveNewWorkouts(uid, await session.fetchAllResults(since), lock);
      const totalResultsCount = await countWorkouts(uid);
      const lastSyncAt = new Date().toISOString();
      await lock.write(tx => {
        tx.set(lock.ref, { cursorAt: startedAt.toISOString() }, { merge: true });
        tx.update(concept2TokenRef(uid), { last_sync_at: lastSyncAt, updated_at: FieldValue.serverTimestamp() });
      });

      console.log(`Incremental sync completed: ${newResultIds.length} new results, ${totalResultsCount} total`);
      return {
        success: true, newResultsCount: newResultIds.length, totalResultsCount, lastSyncAt, newResultIds,
        prRepairPending: Boolean(lock.state.prRepairPending || lock.state.prAppendPending || lock.state.prAppendStarted),
      };
    });
  }
);
