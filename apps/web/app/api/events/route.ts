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
  const out = snap.docs.map(doc => {
    const d = doc.data();
    if(d.v === 1 && d.header?.type) return { header: d.header, body: d.body ?? null, sig: d.sig ?? null };
    else return toChatEvent(d.data())}).filter(Boolean);

  return NextResponse.json(out);
}

// POST /api/events
export async function POST(req: NextRequest) {
  const json = await req.json();
  const db = getAdminDb();

  // v1: { header, body, sig }
  const h = json?.header;
  const isV1 = h?.v === 1 && typeof h?.type === "string";

  let docData: Record<string, any>;

  if (isV1) {
    // 仅用 client 控制字段；serverTime 仍由服务端写
    docData = {
      v: 1,
      type: String(h.type),
      chatId: String(h.chatId),
      messageId: String(h.messageId),
      authorId: String(h.authorId ?? ""),
      clientId: String(h.clientId),
      opId: String(h.opId),
      clientTime: Number(h.clientTime),
      serverTime: Timestamp.now(),

      // 原样保存，便于下行原封不动发回
      header: h,
      body: json.body ?? null,
      sig: json.sig ?? null,
    };
  } else {
    // v0: 旧扁平结构
    docData = {
      type: String(json.type),
      chatId: String(json.chatId),
      messageId: String(json.messageId),
      authorId: String(json.authorId ?? ""),
      clientId: String(json.clientId),
      opId: String(json.opId),
      clientTime: Number(json.clientTime),
      serverTime: Timestamp.now(),
    };

    if (json.type === "create" || json.type === "edit") docData.text = String(json.text ?? "");
    if (json.type === "reaction") {
      docData.emoji = String((json.emoji ?? "").trim());
      docData.op = json.op === "remove" ? "remove" : "add";
    }
    if (json.type === "reply") {
      docData.text = String(json.text ?? "");
      docData.replyTo = String(json.replyTo ?? "");
    }
    // 兼容 payload（比如方案A塞的控制事件）
    if (json.payload != null) docData.payload = json.payload;
  }

  // 幂等：仍用 opId 作为 docId
  const ref = eventsCol(db, String(isV1 ? h.chatId : json.chatId)).doc(String(isV1 ? h.opId : json.opId));
  await ref.set(docData, { merge: false });

  return NextResponse.json({ ok: true });
}