import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Concept2ApiService, concept2Secrets } from './concept2ApiService';
import { concept2TokenRef, getConcept2Tokens, refreshConcept2Tokens } from './concept2Tokens';
import { countWorkouts, saveNewWorkouts } from './workoutStorage';
import { needsPRRebuild, withWorkoutSyncLock, workoutSyncTimeoutSeconds } from './workoutSyncLock';

const db = admin.firestore();

export const initialDataLoad = onCall<{ userId: string }>(
  { secrets: concept2Secrets, timeoutSeconds: workoutSyncTimeoutSeconds },
  async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
    const uid = request.auth.uid;
    if (request.data?.userId !== uid) throw new HttpsError('permission-denied', 'You can only sync your own workouts.');

    return withWorkoutSyncLock(uid, async lock => {
      const startedAt = new Date().toISOString();
      const tokens = await getConcept2Tokens(uid);
      const api = new Concept2ApiService();
      const session = api.openSession(tokens, previous => refreshConcept2Tokens(uid, previous, api));

      const types = db.collection('users').doc(uid).collection('pr_types');
      if ((await types.limit(1).get()).empty) {
        const template = await db.collection('pr_types').get();
        await lock.write(tx => {
          for (const doc of template.docs) {
            tx.create(types.doc(doc.id), {
              ...doc.data(),
              created_at: FieldValue.serverTimestamp(),
              updated_at: FieldValue.serverTimestamp(),
            });
          }
        });
      }

      const newResultIds = await saveNewWorkouts(uid, await session.fetchAllResults(), lock);
      const totalResultsCount = await countWorkouts(uid);
      const lastSyncAt = new Date().toISOString();
      await lock.write(tx => {
        tx.set(lock.ref, { cursorAt: startedAt }, { merge: true });
        tx.update(concept2TokenRef(uid), { last_sync_at: lastSyncAt, updated_at: FieldValue.serverTimestamp() });
      });
      console.log(`Initial data load completed: ${newResultIds.length} new results, ${totalResultsCount} total`);
      return {
        success: true, newResultsCount: newResultIds.length, totalResultsCount, lastSyncAt,
        prRepairPending: needsPRRebuild(lock.state) || Boolean(lock.state.prAppendPending),
      };
    });
  }
);
