import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { Concept2ApiService, reauthRequired } from './concept2ApiService';
import { OAuthTokens } from './types';

const db = admin.firestore();
const { serverTimestamp, delete: deleteField } = FieldValue;

export function concept2TokenRef(uid: string) {
  return db.collection('user_tokens').doc('user_' + uid);
}

type StoredTokens = OAuthTokens & {
  deleted_at?: FirebaseFirestore.Timestamp;
  refresh_lease?: { id: string; expiresAt: number };
};

function readTokens(data: StoredTokens | undefined): OAuthTokens | null {
  if (!data?.access_token || !data.refresh_token || data.deleted_at) return null;
  const { access_token, refresh_token, expires_in, token_type, scope, created_at, last_sync_at } = data;
  return { access_token, refresh_token, expires_in, token_type, scope, created_at, last_sync_at };
}

export async function getConcept2Tokens(uid: string): Promise<OAuthTokens> {
  const tokens = readTokens((await concept2TokenRef(uid).get()).data() as StoredTokens | undefined);
  if (!tokens) throw reauthRequired();
  return tokens;
}

// Serialize token rotation across overlapping manual and background imports.
export async function refreshConcept2Tokens(
  uid: string,
  previous: OAuthTokens,
  api: Concept2ApiService
): Promise<OAuthTokens> {
  const ref = concept2TokenRef(uid);
  const id = randomUUID();

  const acquired = await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as StoredTokens | undefined;
    const tokens = readTokens(data);
    if (!tokens) throw reauthRequired();
    if (tokens.access_token !== previous.access_token || tokens.refresh_token !== previous.refresh_token) {
      return { tokens, refresh: false };
    }
    if (data.refresh_lease?.expiresAt > Date.now()) {
      throw new HttpsError('aborted', 'A Concept2 sync is already refreshing your connection. Try again shortly.');
    }
    tx.update(ref, { refresh_lease: { id, expiresAt: Date.now() + 30000 } });
    return { tokens, refresh: true };
  });
  if (!acquired.refresh) return acquired.tokens;

  try {
    const tokens = await api.refreshAccessToken(acquired.tokens);
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as StoredTokens | undefined;
      if (data?.refresh_lease?.id !== id) {
        throw new HttpsError('aborted', 'Your Concept2 connection changed. Run sync again.');
      }
      tx.update(ref, { ...tokens, refresh_lease: deleteField(), updated_at: serverTimestamp() });
    });
    return tokens;
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as StoredTokens | undefined;
      if (data?.refresh_lease?.id !== id) return;
      if (error instanceof HttpsError && error.details?.['reason'] === 'REAUTH_REQUIRED') {
        tx.update(ref, {
          access_token: deleteField(),
          refresh_token: deleteField(),
          refresh_lease: deleteField(),
          deleted_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      } else {
        tx.update(ref, { refresh_lease: deleteField() });
      }
    });
    throw error;
  }
}
