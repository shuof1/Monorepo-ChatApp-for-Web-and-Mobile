// apps/web/app/api/login/route.ts
export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import { setSessionCookie,verifyIdToken } from "../../../lib/server/auth";

export async function POST(req: Request) {
  const { idToken } = await req.json();

  const decoded = await verifyIdToken(idToken);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  await setSessionCookie(idToken);
  return NextResponse.json({ ok: true });
}
