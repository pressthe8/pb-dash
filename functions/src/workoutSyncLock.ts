import { randomUUID } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireActiveAccount } from './accountDeletionState';
export const workoutSyncTimeoutSeconds = 120;
// Keep the existing Firestore field as a version for both eligibility and scope rules.
export const PR_CALCULATION_VERSION = 3;

export interface WorkoutSyncState {
  cursorAt?: string;
  concept2UserId?: number;
  prRepairPending?: boolean;
  prAppendPending?: boolean;
  prAppendStarted?: boolean;
  prEligibilityVersion?: number;
  lease?: { id: string; expiresAt: number };
}

export function needsPRRebuild(state: WorkoutSyncState): boolean {
  return Boolean(state.prRepairPending || state.prAppendStarted || state.prEligibilityVersion !== PR_CALCULATION_VERSION);
}

export interface WorkoutSyncLock {
  ref: FirebaseFirestore.DocumentReference;
  state: WorkoutSyncState;
  write<T>(work: (tx: FirebaseFirestore.Transaction) => T | Promise<T>): Promise<T>;
}

export function workoutSyncRef(uid: string) {
  return getFirestore().collection('users').doc(uid).collection('sync_state').doc('workouts');
}

export async function withWorkoutSyncLock<T>(uid: string, run: (lock: WorkoutSyncLock) => Promise<T>): Promise<T> {
  const db = getFirestore();
  const ref = workoutSyncRef(uid);
  const id = randomUUID();
  const state = await db.runTransaction(async tx => {
    await requireActiveAccount(tx, uid);
    const current = (await tx.get(ref)).data() as WorkoutSyncState | undefined;
    if (current?.lease?.expiresAt > Date.now()) {
      throw new HttpsError('aborted', 'Another workout sync, PR rebuild or image upload is running. Try again shortly.');
    }
    tx.set(ref, { lease: { id, expiresAt: Date.now() + (workoutSyncTimeoutSeconds + 30) * 1000 } }, { merge: true });
    return current || {};
  });

  try {
    return await run({
      ref,
      state,
      write: work => db.runTransaction(async tx => {
        await requireActiveAccount(tx, uid);
        const lease = (await tx.get(ref)).get('lease') as WorkoutSyncState['lease'];
        if (lease?.id !== id || lease.expiresAt <= Date.now()) {
          throw new HttpsError('aborted', 'This workout sync is no longer active. Try again.');
        }
        return await work(tx);
      }),
    });
  } finally {
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).get('lease.id') === id) {
        tx.update(ref, { lease: FieldValue.delete() });
      }
    }).catch(error => console.warn('Unable to release workout sync lock:', error));
  }
}
