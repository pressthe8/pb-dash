import { randomBytes } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireActiveAccount } from './accountDeletionState';
import { Concept2ApiService, concept2AuthorizationUrl, concept2ClientId, concept2Secrets } from './concept2ApiService';
import { concept2TokenRef } from './concept2Tokens';
import { postSlackActivity, slackStateRef, slackWebhookUrl } from './slackNotifications';
import { workoutSyncRef } from './workoutSyncLock';

const db = admin.firestore();
const callbackLifetimeMs = 10 * 60 * 1000;

function uidFor(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to PB Dash first.');
  return request.auth.uid;
}

function callbackIsAllowed(callback: unknown): callback is string {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  const callbacks = project === 'pb-dash'
    ? ['https://pbdash.pressthe8.com/auth/callback']
    : ['http://localhost:5173/auth/callback', 'https://dev--pb-dash.netlify.app/auth/callback'];
  return typeof callback === 'string' && callbacks.includes(callback);
}

export function concept2AttemptRef(uid: string) {
  return db.collection('concept2_oauth_states').doc(uid);
}

export const beginConcept2Connection = onCall<{ redirectUri: string }>({ secrets: [concept2ClientId] }, async (request) => {
  const uid = uidFor(request);
  const redirectUri = request.data?.redirectUri;
  if (!callbackIsAllowed(redirectUri)) {
    throw new HttpsError('invalid-argument', 'This PB Dash address is not registered for Concept2 sign-in.');
  }
  const state = randomBytes(32).toString('base64url');
  const authorizationUrl = concept2AuthorizationUrl(redirectUri, state);
  await db.runTransaction(async tx => {
    await requireActiveAccount(tx, uid);
    tx.set(concept2AttemptRef(uid), { state, redirectUri, expiresAt: Date.now() + callbackLifetimeMs, used: false });
  });
  return { state, authorizationUrl };
});

export const completeConcept2Connection = onCall<{ code: string; state: string }>({
  secrets: [...concept2Secrets, slackWebhookUrl],
}, async (request) => {
  const uid = uidFor(request);
  const { code, state } = request.data || {};
  if (typeof code !== 'string' || !code.trim() || code.length > 2048 ||
      typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new HttpsError('invalid-argument', 'Concept2 did not return a valid connection code.');
  }

  const ref = concept2AttemptRef(uid);
  const redirectUri = await db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const attempt = (await tx.get(ref)).data();
    if (!attempt || attempt.state !== state || attempt.used || attempt.expiresAt <= Date.now() ||
        !callbackIsAllowed(attempt.redirectUri)) {
      throw new HttpsError('failed-precondition', 'This Concept2 connection has expired. Start the connection again.');
    }
    tx.update(ref, { used: true });
    return attempt.redirectUri;
  });

  const tokens = await new Concept2ApiService().exchangeCode(code, redirectUri);
  const tokenRef = concept2TokenRef(uid);
  const slackRef = slackStateRef(uid);
  const firstConnection = await db.runTransaction(async (tx) => {
    await requireActiveAccount(tx, uid);
    const current = (await tx.get(ref)).data();
    if (current?.state !== state) {
      throw new HttpsError('aborted', 'A newer Concept2 connection was started. Use that connection instead.');
    }
    const [activity, previousToken, sync, profile] = await tx.getAll(
      slackRef, tokenRef, workoutSyncRef(uid), db.collection('users').doc(uid)
    );
    const alreadyConnected = Boolean(activity.get('concept2ConnectionSeen') || previousToken.exists ||
      sync.get('cursorAt') || profile.get('user_id'));
    tx.set(slackRef, { concept2ConnectionSeen: true }, { merge: true });
    tx.set(tokenRef, {
      ...tokens,
      firebase_user_id: uid,
      last_sync_at: null,
      updated_at: FieldValue.serverTimestamp(),
    });
    tx.delete(ref);
    return !alreadyConnected;
  });
  if (firstConnection) {
    await postSlackActivity({
      type: 'concept2_connected', uid, signInProvider: request.auth?.token.firebase?.sign_in_provider,
    });
  }
  return { connected: true };
});

export const getConcept2Connection = onCall(async (request) => {
  const token = (await concept2TokenRef(uidFor(request)).get()).data();
  const connected = Boolean(token?.access_token && token.refresh_token && !token.deleted_at);
  return {
    connected,
    reconnectRequired: Boolean(token?.deleted_at),
    lastSyncAt: connected && typeof token.last_sync_at === 'string' ? token.last_sync_at : null,
  };
});

export const disconnectConcept2 = onCall(async (request) => {
  const uid = uidFor(request);
  const batch = db.batch();
  batch.delete(concept2AttemptRef(uid));
  batch.delete(concept2TokenRef(uid));
  await batch.commit();
  return { connected: false };
});
