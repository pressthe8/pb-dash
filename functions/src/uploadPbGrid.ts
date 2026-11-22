import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { withWorkoutSyncLock } from './workoutSyncLock';
import { gridSport, postSlackActivity, slackStateRef, slackWebhookUrl } from './slackNotifications';

interface UploadPbGridRequest {
  userId: string;
  imageData: string;
  sport?: string;
}

const pngPrefix = 'data:image/png;base64,';
const maxImageBytes = 2 * 1024 * 1024;
const uploadCooldownMs = 60 * 1000;

export const uploadPbGrid = onCall<UploadPbGridRequest>({
  timeoutSeconds: 60, secrets: [slackWebhookUrl],
}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
  const uid = request.auth.uid;
  if (request.data?.userId !== uid) {
    throw new HttpsError('permission-denied', 'You can only upload your own PB images.');
  }

  const { imageData } = request.data;
  if (typeof imageData !== 'string' || !imageData.startsWith(pngPrefix)) {
    throw new HttpsError('invalid-argument', 'Invalid image data format. Expected PNG base64 data.');
  }
  const image = Buffer.from(imageData.slice(pngPrefix.length), 'base64');
  if (image.length > maxImageBytes) {
    throw new HttpsError('invalid-argument', 'Image size is limited to 2 MB.');
  }
  const hash = createHash('sha256').update(image).digest('hex');
  const sport = gridSport(request.data.sport);

  // Account deletion waits for the lease before removing this user's images.
  return withWorkoutSyncLock(uid, async lock => {
    const db = getFirestore();
    const profile = db.collection('users').doc(uid);
    const slackRef = slackStateRef(uid);
    const [profileData, activity] = await db.getAll(profile, slackRef);
    const sameImage = activity.get('lastPbImageHash') === hash;

    const bucket = getStorage().bucket();
    const fileName = `pr_images/${uid}/pbdash_grid.png`;
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/pr_images/${encodeURIComponent(uid)}/pbdash_grid.png`;
    const result = { success: true, imageUrl, message: 'Image uploaded successfully' };
    // The profile timestamp is only a fallback for uploads made before server-side tracking.
    const lastUpload = activity.get('lastPbImageUploadedAt') ?? profileData.get('last_pb_grid_upload');
    if (lastUpload) {
      const uploadedAt = typeof lastUpload.toMillis === 'function'
        ? lastUpload.toMillis()
        : new Date(lastUpload).getTime();
      if (Date.now() - uploadedAt < uploadCooldownMs) {
        if (sameImage) return result;
        throw new HttpsError('resource-exhausted', 'You can upload one PB image per minute. Try again shortly.');
      }
    }

    const file = bucket.file(fileName);
    await file.save(image, {
      resumable: false,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'no-store',
        metadata: {
          uploadedBy: uid,
          uploadedAt: new Date().toISOString(),
          imageType: 'pb_grid',
        },
      },
    });
    await file.makePublic();

    await lock.write(tx => {
      tx.set(profile, {
        last_pb_grid_upload: FieldValue.serverTimestamp(),
        last_updated: new Date().toISOString(),
      }, { merge: true });
      tx.set(slackRef, {
        lastPbImageHash: hash,
        lastPbImageUploadedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    if (!sameImage) {
      await postSlackActivity({ type: 'pb_image_saved', uid, sport, imageUrl, displayName: request.auth?.token.name });
    }
    return result;
  });
});
