// lib/server/firebaseAdmin.ts
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
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

// ✅ 新增：Firestore Admin 单例
export function getAdminDb(): Firestore {
  return getFirestore(init());
}

/** 可选：导出时间工具（看你在路由里想用哪种） */
// 1) 直接用“当前服务器时间”（简单，已足够）：
export const adminNow = () => Timestamp.now();

// 2) 或使用 Firestore 的“服务端提交时间”占位符（写入时用，提交后会被真实 Timestamp 替换）：
export const adminServerTimestamp = () => FieldValue.serverTimestamp();