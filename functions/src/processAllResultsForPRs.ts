import { isDeepStrictEqual } from 'node:util';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Concept2Result } from './types';
import { calculatePaceFor500m } from './paceCalculation';
import { WorkoutSyncLock, withWorkoutSyncLock, workoutSyncTimeoutSeconds } from './workoutSyncLock';
import { workoutBatchSize, workoutCollection } from './workoutStorage';

interface PRType {
  activity_key: string;
  sport: string;
  metric_type: 'time' | 'distance';
  target_distance?: number;
  target_time?: number;
}

interface PRData {
  user_id: string;
  results_id: string;
  activity_key: string;
  sport: string;
  pr_scope: string[];
  metric_type: PRType['metric_type'];
  metric_value: number;
  achieved_at: string;
  season_identifier: string;
  previous_record: null;
  pace_per_500m: number | null;
}

export async function rebuildPersonalBests(uid: string, lock: WorkoutSyncLock) {
  const user = getFirestore().collection('users').doc(uid);
  const typeRef = user.collection('pr_types');
  const eventRef = user.collection('pr_events');
  const [results, existing, userTypes] = await Promise.all([
    workoutCollection(uid).get(), eventRef.get(), typeRef.get(),
  ]);
  let types = userTypes.docs;

  if (userTypes.empty) {
    types = (await getFirestore().collection('pr_types').get()).docs;
    for (let i = 0; i < types.length; i += workoutBatchSize) {
      const chunk = types.slice(i, i + workoutBatchSize);
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
  }

  const workouts = results.docs.map(doc => doc.data() as Concept2Result).sort((a,b) =>
    a.date.localeCompare(b.date) || a.id - b.id
  );
  const desired = new Map<string, PRData>();
  const activities = new Set<string>();

  for (const definition of types) {
    const type = definition.data() as PRType & { is_active?: boolean };
    if (!type.is_active || !type.activity_key || !['time', 'distance'].includes(type.metric_type)) continue;

    const best = new Map<string, PRData>();
    for (const result of workouts) {
      if (result.type !== type.sport || (type.metric_type === 'time'
        ? result.distance !== type.target_distance
        : result.time !== type.target_time)) continue;

      const year = Number(result.date.slice(0, 4));
      const month = Number(result.date.slice(5, 7));
      const season = String(month >= 5 ? year + 1 : year);
      const event: PRData = {
        user_id: uid, results_id: String(result.id), activity_key: type.activity_key,
        sport: result.type, pr_scope: [], metric_type: type.metric_type,
        metric_value: type.metric_type === 'time' ? result.time : result.distance,
        achieved_at: result.date, season_identifier: season, previous_record: null,
        pace_per_500m: calculatePaceFor500m(result.time, result.distance),
      };
      desired.set(result.id + '_' + type.activity_key, event);
      activities.add(type.activity_key);

      for (const scope of ['all-time', 'season-' + season, 'year-' + year]) {
        const previous = best.get(scope);
        if (!previous || (type.metric_type === 'time'
          ? event.metric_value < previous.metric_value
          : event.metric_value > previous.metric_value)) best.set(scope, event);
      }
    }
    for (const [scope, event] of best) event.pr_scope.push(scope);
    for (const event of new Set(best.values())) {
      // Keep array order compatible with the existing presentation and comparisons.
      event.pr_scope.sort((a,b) => a.localeCompare(b));
    }
  }

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

  return {
    success: true,
    totalPRsProcessed: desired.size,
    activitiesProcessed: activities.size,
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
