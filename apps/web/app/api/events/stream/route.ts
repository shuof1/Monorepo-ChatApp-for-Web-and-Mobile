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
  if (raw?.type === "reply") { base.text = String(raw?.text ?? ""); base.replyTo = String(raw?.replyTo ?? ""); }
  // ✅ 关键：把 payload 一并带回
  if (raw?.payload != null) base.payload = raw.payload;
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
      let closed = false;
      let unsub: (() => void) | null = null;
      let hb: any;

      const safeEnq = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      }
      // 心跳，防止代理断开
      hb = setInterval(() => safeEnq(`: ping\n\n`), 15000);

      unsub = q.onSnapshot(
        snap => {
          for (const ch of snap.docChanges()) {
            if (ch.type !== "added") continue;
            const d = ch.doc.data();
            // v1 事件（有 header/body/sig）优先：原样透传
            if (d?.v === 1 && d?.header?.type) {
              const id = String((d.header?.serverTimeMs ?? d.header?.clientTime) ?? Date.now());
              safeEnq(`id: ${id}\n`);
              safeEnq(`data: ${JSON.stringify({ header: d.header, body: d.body ?? null, sig: d.sig ?? null })}\n\n`);
              continue;
            }
            // v0 扁平事件
            const ev = toChatEvent(ch.doc.data());
            const id = String(ev.serverTimeMs ?? ev.clientTime); // SSE 事件 id（用于断点续传）
            safeEnq(`id: ${id}\n`);
            safeEnq(`data: ${JSON.stringify(ev)}\n\n`);
          }
        },
        err => {
          // 推送一条错误事件后收尾
          safeEnq(`event: error\ndata: ${JSON.stringify(String(err?.message || err))}\n\n`);
          cleanup();
        }
      );
      const cleanup = () => {
        if (closed) return;
        closed = true;
        try { clearInterval(hb); } catch { }
        try { unsub?.(); } catch { }
        try { controller.close(); } catch { }
      };

      // 客户端断开（包括页面切换、组件卸载、网络抖动）
      req.signal.addEventListener("abort", cleanup);

      // 把清理函数挂上，便于 ReadableStream.cancel 调用
      (controller as any)._cleanup = cleanup;
    },
    cancel() { try { (this as any)._cleanup?.(); } catch { } },
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
