export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '../../../lib/server/auth';
import { getDb } from 'adapter-firestore-admin';

export async function GET(_req: NextRequest) {
  const me = await getUserFromSession();
  if (!me) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  try {
    const db = getDb();
    const snap = await db.collection('users').limit(200).get(); // demo：最多 200
    const users = snap.docs.map((d) => {
      const data = d.data() ?? {};
      return {
        id: d.id,
        name: typeof data.displayName === 'string' ? data.displayName
             : typeof data.name === 'string' ? data.name
             : null,
      };
    });
    return NextResponse.json({ ok: true, users }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[users] list failed:', e);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
