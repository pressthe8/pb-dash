import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Concept2ApiService, concept2Secrets, reauthRequired } from './concept2ApiService';
import { concept2TokenRef, getConcept2Tokens, refreshConcept2Tokens } from './concept2Tokens';
import { rebuildPersonalBests } from './processAllResultsForPRs';
import { Concept2Result } from './types';
import { validResult, workoutBatchSize, workoutCollection, workoutData } from './workoutStorage';
import { needsPRRebuild, withWorkoutSyncLock, workoutSyncTimeoutSeconds, WorkoutSyncLock } from './workoutSyncLock';

export const reconcileConcept2History = onCall({ secrets: concept2Secrets, timeoutSeconds: workoutSyncTimeoutSeconds }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
  const uid = request.auth.uid;

  return withWorkoutSyncLock(uid, async lock => {
    const startedAt = new Date().toISOString();
    const tokenRef = concept2TokenRef(uid);
    const connectionId = await lock.write(async tx => {
      const data = (await tx.get(tokenRef)).data();
      if (!data?.access_token || !data.refresh_token || data.deleted_at) throw reauthRequired();
      if (typeof data.connection_id === 'string') return data.connection_id;
      const id = randomUUID();
      tx.update(tokenRef, { connection_id: id });
      return id;
    });

    const guardedLock: WorkoutSyncLock = {
      ...lock,
      write: work => lock.write(async tx => {
        const connection = (await tx.get(tokenRef)).data();
        if (connection?.connection_id !== connectionId || connection.deleted_at) {
          throw new HttpsError('aborted', 'The Concept2 connection changed. Reconcile again.');
        }
        return work(tx);
      }),
    };
    const tokens = await getConcept2Tokens(uid);
    const api = new Concept2ApiService();
    const session = api.openSession(tokens, previous => refreshConcept2Tokens(uid, previous, api));
    const concept2UserId = await session.getUserId();
    const workRef = workoutCollection(uid);
    const stored = await workRef.get();
    const matchesOwner = (value: unknown) => typeof value === 'number' && value === concept2UserId;
    if ((lock.state.concept2UserId !== undefined && !matchesOwner(lock.state.concept2UserId)) ||
        stored.docs.some(doc => !matchesOwner(doc.get('user_id')) ||
          !Number.isSafeInteger(doc.get('id')) || doc.get('id') <= 0 || doc.id !== String(doc.get('id')))) {
      throw new HttpsError('failed-precondition', 'The stored workouts belong to a different Concept2 account or could not be verified. History was left unchanged.');
    }

    function verified(result: Concept2Result) {
      if (!validResult(result) || !matchesOwner(result.user_id)) {
        throw new HttpsError('unavailable', 'Could not verify a Concept2 workout. History was left unchanged.');
      }
      return result;
    }

    const incoming = new Map<string, Concept2Result>();
    for (const result of await session.fetchAllResults()) {
      verified(result);
      incoming.set(String(result.id), result);
    }

    const removed: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const missing = stored.docs.filter(doc => !incoming.has(doc.id));
    // A paginated listing can shift during a request. Require a direct 404 before removing anything.
    for (const doc of missing) {
      const result = await session.getResult(doc.get('id'));
      if (result) incoming.set(doc.id, verified(result));
      else removed.push(doc);
    }

    const existing = new Map(stored.docs.map(doc => [doc.id, doc]));
    const upserts = [...incoming].filter(([id, result]) => !isDeepStrictEqual(existing.get(id)?.get('raw_data'), result));
    const addedCount = upserts.filter(([id]) => !existing.has(id)).length;

    // Persist pending repair before changing the mirror. A later repair can resume from all stored workouts.
    if (upserts.length || removed.length) {
      await guardedLock.write(tx => { tx.set(lock.ref, { concept2UserId, prRepairPending: true }, { merge: true }); });
    }

    const changes = [
      ...upserts.map(([id, result]) => (tx: FirebaseFirestore.Transaction) => {
        tx.set(workRef.doc(id), workoutData(uid, result, existing.get(id)?.get('created_at')));
      }),
      ...removed.map(doc => (tx: FirebaseFirestore.Transaction) => { tx.delete(doc.ref); }),
    ];
    for (let i = 0; i < changes.length; i += workoutBatchSize) {
      await guardedLock.write(tx => {
        for (const change of changes.slice(i, i + workoutBatchSize)) change(tx);
      });
    }

    const rebuilt = changes.length > 0 || needsPRRebuild(lock.state) || Boolean(lock.state.prAppendPending);
    if (rebuilt) await rebuildPersonalBests(uid, guardedLock);
    const lastSyncAt = new Date().toISOString();
    await guardedLock.write(tx => {
      tx.set(lock.ref, { cursorAt: startedAt, concept2UserId, prRepairPending: false, prAppendPending: false, prAppendStarted: false }, { merge: true });
      tx.update(tokenRef, { last_sync_at: lastSyncAt, updated_at: FieldValue.serverTimestamp() });
    });

    const summary = {
      addedCount, updatedCount: upserts.length - addedCount, removedCount: removed.length,
      totalResultsCount: incoming.size, lastSyncAt, rebuilt,
    };
    console.log('Concept2 history reconciled', { uid, ...summary });
    return summary;
  });
});
