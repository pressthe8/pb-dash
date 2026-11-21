import { isDeepStrictEqual } from 'node:util';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { buildPRAttempts, calculatePRScopes, PRType } from './personalBests';
import { Concept2Result } from './types';
import { PR_CALCULATION_VERSION, WorkoutSyncLock, withWorkoutSyncLock, workoutSyncTimeoutSeconds } from './workoutSyncLock';
import { workoutBatchSize, workoutCollection } from './workoutStorage';

export async function loadPRTypes(uid: string, lock: WorkoutSyncLock): Promise<PRType[]> {
  const db = getFirestore();
  const typeRef = db.collection('users').doc(uid).collection('pr_types');
  const existing = await typeRef.get();
  if (!existing.empty) return existing.docs.map(doc => doc.data() as PRType);

  const template = (await db.collection('pr_types').get()).docs;
  for (let i = 0; i < template.length; i += workoutBatchSize) {
    const chunk = template.slice(i, i + workoutBatchSize);
    await lock.write(tx => {
      for (const doc of chunk) {
        tx.create(typeRef.doc(doc.id), {
          ...doc.data(),
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    });
  }
  return template.map(doc => doc.data() as PRType);
}

export async function rebuildPersonalBests(uid: string, lock: WorkoutSyncLock) {
  const eventRef = getFirestore().collection('users').doc(uid).collection('pr_events');
  const [results, existing, types] = await Promise.all([
    workoutCollection(uid).get(), eventRef.get(), loadPRTypes(uid, lock),
  ]);
  const desired = buildPRAttempts(uid, results.docs.map(doc => doc.data() as Concept2Result), types);
  for (const [id, update] of calculatePRScopes(desired)) Object.assign(desired.get(id), update);

  const old = new Map(existing.docs.map(doc => [doc.id, doc]));
  const changes = [...desired].filter(([id, data]) => {
    const previous = old.get(id)?.data();
    return !previous || Object.entries(data).some(([key, value]) => !isDeepStrictEqual(previous[key], value));
  });
  const obsolete = existing.docs.filter(doc => !desired.has(doc.id));
  for (let i = 0; i < changes.length; i += workoutBatchSize) {
    await lock.write(tx => {
      for (const [id, data] of changes.slice(i, i + workoutBatchSize)) {
        tx.set(eventRef.doc(id), {
          ...data,
          created_at: old.get(id)?.get('created_at') ?? FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    });
  }
  for (let i = 0; i < obsolete.length; i += workoutBatchSize) {
    await lock.write(tx => {
      for (const doc of obsolete.slice(i, i + workoutBatchSize)) tx.delete(doc.ref);
    });
  }

  await lock.write(tx => { tx.update(lock.ref, { prEligibilityVersion: PR_CALCULATION_VERSION }); });

  return {
    success: true,
    totalPRsProcessed: desired.size,
    activitiesProcessed: new Set([...desired.values()].map(attempt => attempt.activity_key)).size,
    newPREventsCreated: changes.filter(([id]) => !old.has(id)).length,
  };
}

export const processAllResultsForPRs = onCall<{ userId: string }>({ timeoutSeconds: workoutSyncTimeoutSeconds }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
  if (request.data?.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'You can only rebuild your own PBs.');

  return withWorkoutSyncLock(request.auth.uid, async lock => {
    await lock.write(tx => { tx.set(lock.ref, { prRepairPending: true }, { merge: true }); });
    const result = await rebuildPersonalBests(request.auth.uid, lock);
    await lock.write(tx => { tx.update(lock.ref, { prRepairPending: false, prAppendPending: false, prAppendStarted: false }); });
    return result;
  });
});
