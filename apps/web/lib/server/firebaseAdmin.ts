// lib/server/firebaseAdmin.ts
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

type SA = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function init(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set');

  const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as SA;

  // Prefer project_id from the SA; fall back to env var
  const projectId = sa.project_id || process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('project_id missing');

  // Normalize private key newlines in case they’re escaped
  const privateKey = (sa.private_key || '').replace(/\\n/g, '\n');
  const clientEmail = sa.client_email;
  if (!clientEmail || !privateKey) throw new Error('client_email/private_key missing');

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export function adminAuth(): Auth {
  return getAuth(init());
}
