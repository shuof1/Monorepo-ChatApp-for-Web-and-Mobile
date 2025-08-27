export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getUserFromSession } from '../../../../lib/server/auth';
import { getDb } from 'adapter-firestore-admin';


/**
 * GET /api/user/me
 * 返回当前登录用户的基本信息（来源于 Session Cookie），
 * 并尽力从 Firestore 的 users/{uid} 读取可选的 profile 字段进行补充。
 */
export async function GET() {
  const user = await getUserFromSession();
  const uid = (user as any)?.id ?? (user as any)?.uid ?? ''; // ← 兼容
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const base = { id: uid, email: (user as any)?.email ?? null };
  let profile: any = null;

  try {
    const db = getDb();
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const d = snap.data() ?? {};
      profile = {
        displayName: typeof d.displayName === 'string' ? d.displayName : null,
        avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : null,
        bio: typeof d.bio === 'string' ? d.bio : null,
        locale: typeof d.locale === 'string' ? d.locale : null,
        timezone: typeof d.timezone === 'string' ? d.timezone : null,
      };
    }
  } catch (e) {
    console.warn('[user/me] failed to read profile:', e);
  }

  return NextResponse.json({ ok: true, user: { ...base, profile } }, { headers: { 'Cache-Control': 'no-store' } });
}
