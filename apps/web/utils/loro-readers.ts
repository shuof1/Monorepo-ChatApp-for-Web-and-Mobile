// apps/web/lib/loro-readers.ts
import { LoroDoc, LoroMap, LoroText } from "loro-crdt";
import type { ChatMsg } from "sync-engine";

/** 读取 LoroText 文本 */
function readText(m: LoroMap): string | undefined {
  const t = m.get("text");
  if (t instanceof LoroText) {
    // LoroText 常见读取方式：toString() 或 getString(0, len)
    try { return (t as any).toString?.() ?? ""; } catch {}
    try { return (t as any).text ?? ""; } catch {}
  }
  return undefined;
}

/** 读取 reactions: Map<emoji, Map<userId,Bool>> -> Record<string,string[]> */
function readReactions(m: LoroMap): Record<string, string[]> | undefined {
  const rx = m.get("reactions");
  if (!(rx instanceof LoroMap)) return undefined;

  const out: Record<string, string[]> = {};
  // 迭代 LoroMap：不同版本 API 略有差异，做多路兜底
  const iterKeys = (rx as any).keys?.bind(rx)
                ?? (rx as any).__keys?.bind(rx)
                ?? (() => {
                     // 最后兜底：尝试 toJSON
                     const tmp = (rx as any).toJSON?.();
                     return tmp ? Object.keys(tmp) : [];
                   });

  for (const emoji of iterKeys()) {
    const per = rx.get(emoji);
    if (!(per instanceof LoroMap)) continue;

    const users: string[] = [];
    const userKeys = (per as any).keys?.bind(per)
                  ?? (per as any).__keys?.bind(per)
                  ?? (() => {
                       const tmp = (per as any).toJSON?.();
                       return tmp ? Object.keys(tmp) : [];
                     });

    for (const uid of userKeys()) {
      const v = per.get(uid);
      if (v) users.push(uid);
    }
    if (users.length) out[emoji] = users;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 将单条 LoroMap → ChatMsg（不做全量扫描） */
export function mapLoroMsgToChatMsg(id: string, raw: LoroMap): ChatMsg {
  const text = readText(raw);
  const reactions = readReactions(raw);

  // 时间字段尽量兼容 number | string | Date
  const createdAtRaw = raw.get("createdAt");
  const updatedAtRaw = raw.get("updatedAt");
  const deleted = !!raw.get("deleted");
  const authorId = (raw.get("authorId") ?? "") as string;

  const toDate = (v: any): Date | undefined => {
    if (!v) return undefined;
    if (v instanceof Date) return v;
    const n = typeof v === "number" ? v : Date.parse(String(v));
    return isFinite(n) ? new Date(n) : undefined;
  };

  const msg: ChatMsg = {
    id,
    messageId: id,
    // chatId 一般不存放在每条 message 中，如需要可由上层补充
    authorId,
    text: text ?? undefined,
    createdAt: toDate(createdAtRaw) ?? new Date(0),
    updatedAt: toDate(updatedAtRaw) ?? (toDate(createdAtRaw) ?? new Date(0)),
    deleted,
    reactions,                 // ✅ UI 直接可用
    // payload: … 如需保留原始结构，可在此拼装
  } as ChatMsg;

  return msg;
}

/** O(1) 精确读取：从 doc 中直接取 messageId 对应的 LoroMap 并映射 */
export function getMessageFromDoc(doc: LoroDoc, id: string): ChatMsg | undefined {
  const messages = doc.getMap("messages");
  const raw = messages.get(id);
  if (!(raw instanceof LoroMap)) return undefined;
  return mapLoroMsgToChatMsg(id, raw);
}
