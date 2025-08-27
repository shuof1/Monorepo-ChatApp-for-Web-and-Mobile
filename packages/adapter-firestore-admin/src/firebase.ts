import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Server-only initialization for Firebase Admin + Firestore.
 *
 * Credential precedence:
 *  1) FIREBASE_SERVICE_ACCOUNT_JSON (full JSON string)
 *  2) FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 of JSON)
 *  3) Application Default Credentials (GCP / local with GOOGLE_APPLICATION_CREDENTIALS)
 */
function getCredential() {
  
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  console.log('FIREBASE_SERVICE_ACCOUNT_BASE64', b64);
  if (b64) {
    const parsed = Buffer.from(b64, 'base64').toString('utf8');
    return cert(JSON.parse(parsed));
  }
  return applicationDefault();
}

export function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: getCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
  const db = getFirestore();
  // Recommended: set explicit timestampsInSnapshots true by default in admin SDK
  return db;
}
