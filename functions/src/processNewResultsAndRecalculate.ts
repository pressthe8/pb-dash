import { isDeepStrictEqual } from 'node:util';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { buildPRAttempts, calculatePRScopes, PRAttempt } from './personalBests';
import { loadPRTypes, rebuildPersonalBests } from './processAllResultsForPRs';
import { Concept2Result } from './types';
import { needsPRRebuild, withWorkoutSyncLock, workoutSyncTimeoutSeconds } from './workoutSyncLock';
import { workoutBatchSize, workoutCollection } from './workoutStorage';

export const processNewResultsAndRecalculate = onCall<{ userId: string }>(
  { timeoutSeconds: workoutSyncTimeoutSeconds },
  async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
    const uid = request.auth.uid;
    if (request.data?.userId !== uid) throw new HttpsError('permission-denied', 'You can only update your own PBs.');

    return withWorkoutSyncLock(uid, async lock => {
      if (needsPRRebuild(lock.state)) {
        const result = await rebuildPersonalBests(uid, lock);
        await lock.write(tx => { tx.update(lock.ref, { prRepairPending: false, prAppendPending: false, prAppendStarted: false }); });
        return result;
      }

      const eventRef = getFirestore().collection('users').doc(uid).collection('pr_events');
      const [results, existing] = await Promise.all([workoutCollection(uid).get(), eventRef.get()]);
      const saved = new Map(existing.docs.map(doc => [doc.id, doc.data() as PRAttempt]));
      const processed = new Set([...saved.values()].map(attempt => attempt.results_id));
      const newResults = results.docs.map(doc => doc.data() as Concept2Result)
        .filter(result => !processed.has(String(result.id)));
      const added = newResults.length
        ? buildPRAttempts(uid, newResults, await loadPRTypes(uid, lock))
        : new Map<string, PRAttempt>();
      const affected = new Set([...added.values()].map(attempt => attempt.activity_key));

      if (added.size) {
        const candidates = new Map([...saved].filter(([, attempt]) => affected.has(attempt.activity_key)));
        for (const [id, attempt] of added) candidates.set(id, attempt);

        const writes: ((tx: FirebaseFirestore.Transaction) => void)[] = [];
        for (const [id, scope] of calculatePRScopes(candidates)) {
          const next = added.get(id);
          const previous = saved.get(id);
          if (next) {
            writes.push(tx => {
              tx.create(eventRef.doc(id), {
                ...next, ...scope,
                created_at: FieldValue.serverTimestamp(),
                updated_at: FieldValue.serverTimestamp(),
              });
            });
          } else if (previous.season_identifier !== scope.season_identifier ||
                     !isDeepStrictEqual(previous.pr_scope, scope.pr_scope)) {
            writes.push(tx => {
              tx.update(eventRef.doc(id), { ...scope, updated_at: FieldValue.serverTimestamp() });
            });
          }
        }

        // A retry after any partial batch write repairs from the stored workouts.
        await lock.write(tx => { tx.update(lock.ref, { prAppendStarted: true }); });
        for (let i = 0; i < writes.length; i += workoutBatchSize) {
          await lock.write(tx => {
            for (const write of writes.slice(i, i + workoutBatchSize)) write(tx);
          });
        }
      }
      await lock.write(tx => { tx.update(lock.ref, { prAppendPending: false, prAppendStarted: false }); });

      return {
        success: true,
        totalPRsProcessed: saved.size + added.size,
        activitiesProcessed: affected.size,
        newPREventsCreated: added.size,
      };
    });
  }
);
