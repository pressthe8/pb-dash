import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { accountDeletionRef } from './accountDeletionState';
import { concept2AttemptRef } from './concept2Connection';
import { concept2TokenRef } from './concept2Tokens';
import { workoutSyncRef } from './workoutSyncLock';

// A signed Firebase ID token can remain valid for an hour after Auth deletion.
const staleSessionGuardMs = 2 * 60 * 60 * 1000;

export const deleteUserAccount = onCall<{ userId: string }>({ timeoutSeconds: 300 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
  const uid = request.auth.uid;
  if (request.data?.userId !== uid) {
    throw new HttpsError('permission-denied', 'You can only delete your own account.');
  }

  const db = getFirestore();
  const deletion = accountDeletionRef(uid);
  try {
    const completed = await db.runTransaction(async tx => {
      const status = await tx.get(deletion);
      if (status.exists) return Boolean(status.get('expireAt'));

      const syncState = await tx.get(workoutSyncRef(uid));
      if (syncState.get('lease.expiresAt') > Date.now()) {
        throw new HttpsError('aborted', 'A workout sync, PR rebuild or image upload is running. Try again shortly.');
      }
      tx.create(deletion, { startedAt: FieldValue.serverTimestamp() });
      return false;
    });
    if (completed) return { success: true };

    const bucket = getStorage().bucket();
    const images = bucket.getFilesStream({ prefix: `pr_images/${uid}/`, versions: true });
    for await (const image of images) {
      await image.delete({ ignoreNotFound: true });
    }

    const batch = db.batch();
    batch.delete(concept2TokenRef(uid));
    batch.delete(concept2AttemptRef(uid));
    await batch.commit();
    await db.recursiveDelete(db.collection('users').doc(uid));

    // Keep the sign-in available for a retry until all associated data is gone.
    await getAuth().deleteUser(uid).catch(error => {
      if (error.code !== 'auth/user-not-found') throw error;
    });
    await deletion.set({ expireAt: Timestamp.fromMillis(Date.now() + staleSessionGuardMs) });
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Account deletion failed', { uid, error });
    throw new HttpsError('unavailable', 'Couldn’t confirm that account deletion completed. Try again from Profile.');
  }
});
