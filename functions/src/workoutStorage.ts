import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { calculatePaceFor500m } from './paceCalculation';
import { Concept2Result } from './types';
import { WorkoutSyncLock } from './workoutSyncLock';

export const workoutBatchSize = 150;

export function workoutCollection(uid: string) {
  return getFirestore().collection('users').doc(uid).collection('results');
}

export function validResult(result: Concept2Result): boolean {
  return Number.isSafeInteger(result?.id) && result.id > 0 &&
    Number.isSafeInteger(result.user_id) && result.user_id > 0 &&
    Number.isFinite(result.time) && result.time >= 0 &&
    Number.isFinite(result.distance) && result.distance >= 0 &&
    typeof result.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(result.date) &&
    typeof result.type === 'string';
}

export function workoutData(uid: string, result: Concept2Result, createdAt: unknown = FieldValue.serverTimestamp()) {
  return {
    ...result,
    firebase_user_id: uid,
    raw_data: result,
    pace_per_500m: calculatePaceFor500m(result.time, result.distance),
    created_at: createdAt,
    updated_at: FieldValue.serverTimestamp(),
  };
}

export async function saveNewWorkouts(uid: string, results: Concept2Result[], lock: WorkoutSyncLock): Promise<string[]> {
  if (results.some(result => !validResult(result))) {
    throw new HttpsError('unavailable', 'Concept2 returned an invalid workout. Try again before syncing.');
  }
  const byId = new Map(results.map(result => [String(result.id), result]));
  if (!byId.size) return [];
  const resultsRef = workoutCollection(uid);
  const saved = lock.state.concept2UserId === undefined ? (await resultsRef.limit(1).get()).docs[0] : undefined;
  const owner = lock.state.concept2UserId ?? saved?.get('user_id') ?? results[0].user_id;
  if (!Number.isSafeInteger(owner) || results.some(result => result.user_id !== owner)) {
    throw new HttpsError('failed-precondition', 'These workouts belong to a different Concept2 account. Your history was left unchanged.');
  }
  const refs = [...byId.keys()].map(id => resultsRef.doc(id));
  const added: string[] = [];

  for (let i = 0; i < refs.length; i += workoutBatchSize) {
    const existing = await getFirestore().getAll(...refs.slice(i, i + workoutBatchSize));
    const missing = existing.filter(doc => !doc.exists);
    if (!missing.length) continue;
    await lock.write(tx => {
      for (const doc of missing) tx.create(doc.ref, workoutData(uid, byId.get(doc.id)));
      tx.set(lock.ref, { concept2UserId: owner, prAppendPending: true }, { merge: true });
    });
    added.push(...missing.map(doc => doc.id));
  }
  return added;
}

export async function countWorkouts(uid: string): Promise<number> {
  return (await workoutCollection(uid).count().get()).data().count;
}
