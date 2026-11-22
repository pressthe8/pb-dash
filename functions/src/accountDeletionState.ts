import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export function accountDeletionRef(uid: string) {
  return getFirestore().collection('account_deletions').doc(uid);
}

export async function requireActiveAccount(tx: FirebaseFirestore.Transaction, uid: string): Promise<void> {
  if ((await tx.get(accountDeletionRef(uid))).exists) {
    throw new HttpsError('failed-precondition', 'Account deletion has started. Return to Profile to finish deleting your account.');
  }
}
