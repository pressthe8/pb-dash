import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { withWorkoutSyncLock } from './workoutSyncLock';

interface UploadPbGridRequest {
  userId: string;
  imageData: string;
}

const pngPrefix = 'data:image/png;base64,';
const maxImageBytes = 2 * 1024 * 1024;
const uploadCooldownMs = 60 * 1000;

export const uploadPbGrid = onCall<UploadPbGridRequest>({ timeoutSeconds: 60 }, async request => {
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

  // Account deletion waits for the lease before removing this user's images.
  return withWorkoutSyncLock(uid, async lock => {
    const profile = getFirestore().collection('users').doc(uid);
    const lastUpload = (await profile.get()).get('last_pb_grid_upload');
    if (lastUpload) {
      const uploadedAt = typeof lastUpload.toMillis === 'function'
        ? lastUpload.toMillis()
        : new Date(lastUpload).getTime();
      if (Date.now() - uploadedAt < uploadCooldownMs) {
        throw new HttpsError('resource-exhausted', 'You can upload one PB image per minute. Try again shortly.');
      }
    }

    const bucket = getStorage().bucket();
    const fileName = `pr_images/${uid}/pbdash_grid.png`;
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
    });

    return {
      success: true,
      imageUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
      message: 'Image uploaded successfully',
    };
  });
});
