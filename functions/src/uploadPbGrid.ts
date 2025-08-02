import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Define secrets for this function (for consistency with other functions)
const concept2ClientId = defineSecret('CONCEPT2_CLIENT_ID');
const concept2ClientSecret = defineSecret('CONCEPT2_CLIENT_SECRET');

interface UploadPbGridRequest {
  userId: string;
  imageData: string; // Base64 encoded image data
}

interface UploadPbGridResponse {
  success: boolean;
  imageUrl: string;
  message?: string;
}

export const uploadPbGrid = onCall<UploadPbGridRequest>(
  {
    // CRITICAL: Declare the secrets this function uses (for consistency)
    secrets: [concept2ClientId, concept2ClientSecret]
  },
  async (request): Promise<UploadPbGridResponse> => {
    // Enhanced authentication verification
    console.log('Authentication context:', {
      hasAuth: !!request.auth,
      authUid: request.auth?.uid,
      authToken: request.auth?.token ? 'present' : 'missing'
    });

    if (!request.auth || !request.auth.uid) {
      console.error('Authentication failed - no auth context or uid');
      throw new Error('User must be authenticated');
    }

    const { userId, imageData } = request.data;
    
    // Verify user can only upload their own images
    if (request.auth.uid !== userId) {
      console.error('Permission denied - auth uid does not match requested userId', {
        authUid: request.auth.uid,
        requestedUserId: userId
      });
      throw new Error('User can only upload their own images');
    }

    try {
      console.log(`Starting PB grid image upload for user: ${userId}`);
      
      // Step 1: Rate limiting check
      await checkRateLimit(userId);
      
      // Step 2: Validate and process image data
      if (!imageData || !imageData.startsWith('data:image/png;base64,')) {
        throw new Error('Invalid image data format. Expected PNG base64 data.');
      }
      
      // Extract base64 data (remove data URL prefix)
      const base64Data = imageData.replace('data:image/png;base64,', '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Validate image size (prevent abuse)
      const maxSizeBytes = 2 * 1024 * 1024; // 2MB limit
      if (imageBuffer.length > maxSizeBytes) {
        throw new Error('Image size too large. Maximum size is 2MB.');
      }
      
      console.log(`Image data validated: ${imageBuffer.length} bytes`);
      
      // Step 3: Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const fileName = `pr_images/${userId}/pbdash_grid.png`;
      const file = bucket.file(fileName);
      
      // Upload the image with metadata
      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/png',
          cacheControl: 'public, max-age=3600', // Cache for 1 hour
          metadata: {
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
            imageType: 'pb_grid'
          }
        }
      });
      
      console.log(`Image uploaded successfully to: ${fileName}`);
      
      // Step 4: Make the file publicly readable
      await file.makePublic();
      
      // Step 5: Get the public URL
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      
      // Step 6: Update rate limiting timestamp
      await updateRateLimitTimestamp(userId);
      
      console.log(`PB grid image upload completed for user ${userId}: ${publicUrl}`);
      
      return {
        success: true,
        imageUrl: publicUrl,
        message: 'Image uploaded successfully'
      };

    } catch (error) {
      console.error('PB grid image upload failed:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
          throw new Error('Please wait before uploading another image. You can upload once per minute.');
        }
      }
      
      throw new Error(`Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * Check rate limiting for PB grid uploads
 * Enforces 1 minute cooldown between uploads
 */
async function checkRateLimit(userId: string): Promise<void> {
  try {
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const lastUpload = userData?.last_pb_grid_upload;
      
      if (lastUpload) {
        const lastUploadTime = lastUpload.toDate ? lastUpload.toDate().getTime() : new Date(lastUpload).getTime();
        const now = Date.now();
        const cooldownPeriod = 60 * 1000; // 1 minute in milliseconds
        const timeSinceLastUpload = now - lastUploadTime;
        
        if (timeSinceLastUpload < cooldownPeriod) {
          const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastUpload) / 1000);
          console.log(`Rate limit exceeded for user ${userId}. ${remainingTime} seconds remaining.`);
          throw new Error(`RATE_LIMIT_EXCEEDED: Please wait ${remainingTime} seconds before uploading another image.`);
        }
      }
    }
    
    console.log(`Rate limit check passed for user ${userId}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('RATE_LIMIT_EXCEEDED')) {
      throw error;
    }
    console.error('Error checking rate limit:', error);
    throw new Error('Failed to check rate limit');
  }
}

/**
 * Update the rate limiting timestamp for the user
 */
async function updateRateLimitTimestamp(userId: string): Promise<void> {
  try {
    const userDocRef = db.collection('users').doc(userId);
    
    await userDocRef.set({
      last_pb_grid_upload: admin.firestore.FieldValue.serverTimestamp(),
      last_updated: new Date().toISOString()
    }, { merge: true });
    
    console.log(`Updated rate limit timestamp for user ${userId}`);
  } catch (error) {
    console.error('Error updating rate limit timestamp:', error);
    // Don't throw here - the upload was successful, this is just housekeeping
  }
}