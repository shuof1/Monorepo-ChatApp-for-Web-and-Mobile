export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { getAdminDb } from "../../../../lib/server/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// /chats/{chatId}/events
const eventsCol = (db: FirebaseFirestore.Firestore, chatId: string) =>
  db.collection("chats").doc(chatId).collection("events");

function toChatEvent(raw: any) {
  const stm = raw?.serverTime instanceof Timestamp ? raw.serverTime.toMillis() : undefined;
  const base: any = {
    type: raw?.type, chatId: String(raw?.chatId ?? ""), messageId: String(raw?.messageId ?? ""),
    authorId: String(raw?.authorId ?? ""), clientId: String(raw?.clientId ?? ""),
    opId: String(raw?.opId ?? ""), clientTime: Number(raw?.clientTime ?? 0),
    serverTimeMs: stm,
  };
  if (raw?.type === "create" || raw?.type === "edit") base.text = String(raw?.text ?? "");
  if (raw?.type === "reaction") { base.emoji = String((raw?.emoji ?? "").trim()); base.op = raw?.op === "remove" ? "remove" : "add"; }
  if (raw?.type === "reply")   { base.text = String(raw?.text ?? ""); base.replyTo = String(raw?.replyTo ?? ""); }
  return base;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  if (!chatId) return new Response("chatId required", { status: 400 });

  // 支持断线续传：优先用 Last-Event-ID，其次用 sinceMs 参数
  const lei = req.headers.get("last-event-id");
  const since = Number(lei ?? searchParams.get("sinceMs") ?? 0);

  const db = getAdminDb();
  let q: FirebaseFirestore.Query = eventsCol(db, chatId).orderBy("serverTime", "asc");
  if (since) q = q.where("serverTime", ">", Timestamp.fromMillis(since));

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      // 心跳，防止代理断开
      const hb = setInterval(() => controller.enqueue(enc.encode(`: ping\n\n`)), 15000);

      const unsub = q.onSnapshot(
        snap => {
          for (const ch of snap.docChanges()) {
            if (ch.type !== "added") continue;
            const ev = toChatEvent(ch.doc.data());
            const id = String(ev.serverTimeMs ?? ev.clientTime); // SSE 事件 id（用于断点续传）
            controller.enqueue(enc.encode(`id: ${id}\n`));
            controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
          }
        },
        err => controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify(String(err))}\n\n`))
      );

      (controller as any)._cleanup = () => { clearInterval(hb); unsub(); };
    },
    cancel() { try { (this as any)._cleanup?.(); } catch {} },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Nginx 等代理不缓冲
    },
  });
}
