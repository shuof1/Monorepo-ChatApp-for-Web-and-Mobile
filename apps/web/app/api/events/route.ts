// apps/web/app/api/events/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromSession } from '../../../lib/server/auth';

import { createLocalSor } from 'sor-core';
import { MembershipAcl } from 'sor-core';
// import { createFirestoreEventStore, FirestoreMembershipRepo } from 'adapter-firestore-admin';
import { handleAppend, handleList } from 'adapter-http-web';
import {createFirestoreEventStore,FirestoreMembershipRepo} from 'adapter-firestore-admin';


// ---- assemble SoR deps once (module scope) ----
const store = createFirestoreEventStore();
const acl = new MembershipAcl(new FirestoreMembershipRepo());
const sor = createLocalSor({ store, acl });

// POST /api/events  —— 追加事件（body = ChatEvent wire 对象）
export async function POST(req: NextRequest) {
  const user = await getUserFromSession();
  const body = await req.json();

  const res = await handleAppend(sor, {
    userId: user?.id,      // 认证身份注入
    body,                  // 客户端传入的 ChatEvent（type/chatId/authorId/...）
    // enforceAuthorMatch: true (默认)，防止伪造 authorId
  });

  return NextResponse.json(res.json, { status: res.status, headers: res.headers });
}

// GET /api/events?chatId=xxx&after=0&limit=200  —— 拉取增量
export async function GET(req: NextRequest) {
  const user = await getUserFromSession();
  const { searchParams } = new URL(req.url);

  const res = await handleList(sor, {
    userId: user?.id,
    chatId: searchParams.get('chatId') ?? undefined,
    afterServerSeq: searchParams.get('after') ?? undefined, // 支持 after=serverSeq
    limit: searchParams.get('limit') ?? undefined,
  });

  return NextResponse.json(res.json, { status: res.status, headers: res.headers });
}
