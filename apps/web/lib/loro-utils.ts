import { LoroDoc, LoroMap, LoroList, LoroText } from "loro-crdt";
import type { ChatEvent, ChatMsg } from "sync-engine";

/**
 * 将一个 ChatEvent 应用到 Loro 文档中。
 */
export function applyEventToLoro(doc: LoroDoc, ev: ChatEvent): void {
  const messages = doc.getMap("messages");

  switch (ev.type) {
    case "create": {
      const msgMap = new LoroMap();
      const text = new LoroText();
      text.insert(0, ev.text);

      msgMap.setContainer("text", text);
      msgMap.set("authorId", ev.authorId);
      msgMap.set("createdAt", ev.clientTime);
      msgMap.setContainer("reactions", new LoroMap());
      msgMap.setContainer("replies", new LoroList());

      if (ev.replyTo) {
        msgMap.set("replyTo", ev.replyTo);
        // 更新被回复对象的 replies 字段
        const target = messages.get(ev.replyTo);
        if (target instanceof LoroMap) {
          const replies = target.get("replies") as LoroList;
          replies?.push(ev.messageId);
        }
      }

      messages.setContainer(ev.messageId, msgMap);
      break;
    }

    case "edit": {
      const msg = messages.get(ev.messageId);
      if (msg instanceof LoroMap) {
        const text = msg.get("text") as LoroText;
        text.delete(0, text.length);
        text.insert(0, ev.text);
        msg.set("updatedAt", ev.clientTime);
      }
      break;
    }

    case "delete": {
      const msg = messages.get(ev.messageId);
      if (msg instanceof LoroMap) {
        msg.set("deleted", true);
      }
      break;
    }

    case "reaction": {
      const msg = messages.get(ev.messageId);
      if (!(msg instanceof LoroMap)) break;

      let reactions = msg.get("reactions") as LoroMap;
      if (!reactions) {
        reactions = new LoroMap();
        msg.setContainer("reactions", reactions);
      }

      let perUser = reactions.get(ev.emoji) as LoroMap;
      if (!perUser) {
        perUser = new LoroMap();
        reactions.setContainer(ev.emoji, perUser);
      }

      if (ev.op === "add") {
        // 并发：不同用户写不同 key → 天然无冲突
        // 同一用户 add vs remove 并发 → 交给 Loro 的 LWW
        perUser.set(ev.authorId, true);
      } else {
        // remove：删除这个键；与并发 add 的裁决也交由 Loro 的 LWW
        perUser.delete(ev.authorId);
      }
      break;
    }

    case "reply": {
      // reply 本质上是 create + replyTo
      applyEventToLoro(doc, { ...ev, type: "create" });
      break;
    }
  }

}
/** 从 doc 中提取全部消息，供 UI 使用 */
export function getAllMessagesFromDoc(doc: LoroDoc): ChatMsg[] {
  const messages = doc.getMap("messages");
  const result: ChatMsg[] = [];

  for (const [id, value] of messages.entries()) {
    if (value instanceof LoroMap) {
      const text = value.get('text') as LoroText;
      const deleted = value.get('deleted') ?? false;
      const repliesRaw = value.get('replies');
      const reactionsRaw = value.get('reactions');
      const msg: ChatMsg = {
        id,
        text: text.toString(),
        authorId: value.get('authorId') as string,
        createdAt: new Date(value.get('createdAt') as number),
        updatedAt: value.get('updatedAt') ? new Date(value.get('updatedAt') as number) : undefined,
        deleted: value.get('deleted') as boolean,
        replyTo: value.get('replyTo') as string,
        replies:
          repliesRaw instanceof LoroList
            ? (repliesRaw.toArray() as string[])
            : Array.isArray(repliesRaw)
              ? (repliesRaw as string[])
              : [],
        reactions: extractReactions(reactionsRaw),
      };
      result.push(msg);
    }
  }

  return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** 工具函数：从 LoroMap(reactions) 转换为 { emoji: userId[] } */
function extractReactions(raw: unknown): Record<string, string[]> | undefined {
  if (!(raw instanceof LoroMap)) return undefined;

  const out: Record<string, string[]> = {};

  for (const [emoji, container] of raw.entries()) {
    // 新结构：LoroMap<userId, boolean>
    if (container instanceof LoroMap) {
      const users: string[] = [];
      for (const [uid, v] of container.entries()) {
        // 只要键存在就算“已反应”，值可忽略（boolean / any）
        void v;
        users.push(String(uid));
      }
      if (users.length) out[String(emoji)] = users;
      continue;
    }

    // 旧结构兜底：LoroList<string>
    if (container instanceof LoroList) {
      const users = (container.toArray() as unknown[]).map(String);
      if (users.length) out[String(emoji)] = users;
      continue;
    }

    // 其它未知类型忽略
  }

  return Object.keys(out).length ? out : undefined;
}
