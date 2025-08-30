export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/server/firebaseAdmin"; // 你的 Admin 封装
import { Timestamp } from "firebase-admin/firestore";

// Firestore 路径：/chats/{chatId}/events
const eventsCol = (db: FirebaseFirestore.Firestore, chatId: string) =>
  db.collection("chats").doc(chatId).collection("events");

// 与客户端一致的映射
function toChatEvent(raw: any) {
  const serverTimeMs =
    raw?.serverTime instanceof Timestamp ? raw.serverTime.toMillis() : undefined;

  const base: any = {
    type: raw?.type,
    chatId: String(raw?.chatId ?? ""),
    messageId: String(raw?.messageId ?? ""),
    authorId: String(raw?.authorId ?? ""),
    clientId: String(raw?.clientId ?? ""),
    opId: String(raw?.opId ?? ""),
    clientTime: Number(raw?.clientTime ?? 0),
    serverTimeMs,
  };

  switch (raw?.type) {
    case "create":
    case "edit":
      base.text = String(raw?.text ?? "");
      break;
    case "reaction":
      base.emoji = String((raw?.emoji ?? "").trim());
      base.op = raw?.op === "remove" ? "remove" : "add";
      break;
    case "reply":
      base.text = String(raw?.text ?? "");
      base.replyTo = String(raw?.replyTo ?? "");
      break;
  }
  return base;
}

// GET /api/events?chatId&sinceMs&limit
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });

  const sinceMs = searchParams.get("sinceMs");
  const limit = searchParams.get("limit");

  const db = getAdminDb();
  let q: FirebaseFirestore.Query = eventsCol(db, chatId).orderBy("serverTime", "asc");
  if (sinceMs) q = q.where("serverTime", ">", Timestamp.fromMillis(Number(sinceMs)));
  if (limit) q = q.limit(Number(limit));

  const snap = await q.get();
  const out = snap.docs.map(d => toChatEvent(d.data())).filter(Boolean);

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/events
export async function POST(req: NextRequest) {
  const body = await req.json(); // 不做 ACL 校验，直接透传
  const db = getAdminDb();

  const docData: Record<string, any> = {
    type: body.type,
    chatId: String(body.chatId),
    messageId: String(body.messageId),
    authorId: String(body.authorId ?? ""), // 如果你希望以后由服务端强制覆盖，这里可替换为登录用户
    clientId: String(body.clientId),
    opId: String(body.opId),
    clientTime: Number(body.clientTime),
    serverTime: Timestamp.now(), // 统一由服务端写入排序时间
  };

  if (body.type === "create" || body.type === "edit") docData.text = String(body.text ?? "");
  if (body.type === "reaction") { docData.emoji = String((body.emoji ?? "").trim()); docData.op = body.op === "remove" ? "remove" : "add"; }
  if (body.type === "reply")   { docData.text = String(body.text ?? ""); docData.replyTo = String(body.replyTo ?? ""); }

  const ref = eventsCol(db, String(body.chatId)).doc(String(body.opId)); // 用 opId 作为 docId（幂等）
  await ref.set(docData, { merge: false });

  return NextResponse.json({ ok: true });
}
