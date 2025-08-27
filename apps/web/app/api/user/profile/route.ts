// apps/web/app/api/user/profile/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '../../../../lib/server/auth';
import { getDb } from 'adapter-firestore-admin';
import { FieldValue } from 'firebase-admin/firestore';

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// POST /api/user/profile
// body: { name: string; dob: 'yyyy-mm-dd'; gender: 'Male'|'Female'|'Other' }
export async function POST(req: NextRequest) {
  const me = await getUserFromSession();
  const uid = (me as any)?.id ?? (me as any)?.uid ?? '';   // ← 容错
  if (!me) return bad(401, 'UNAUTHENTICATED');

  const { name, dob, gender } = await req.json();

  // 1) 校验
  const trimmed = (name ?? '').toString().trim();
  if (!trimmed) return bad(400, 'NAME_REQUIRED');

  const dobStr = (dob ?? '').toString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) return bad(400, 'DOB_INVALID');

  const g: string = (gender ?? '').toString();
  if (!['Male', 'Female', 'Other'].includes(g)) return bad(400, 'GENDER_INVALID');

  // 2) 写入 Firestore（服务端 Admin）
  try {
    const db = getDb();

    await db.collection('users').doc(uid).set(
      {
        name: trimmed,
        displayName: trimmed,
        dob: dobStr,
        gender: g,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 也可以顺手返回 profileComplete，方便前端判断跳转
    return NextResponse.json({ ok: true, profileComplete: true }, { status: 200 });
  } catch (e) {
    console.error('[profile] save failed:', e);
    return bad(500, 'INTERNAL');
  }
}
