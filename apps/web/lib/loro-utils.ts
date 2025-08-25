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
      // 1) 防御：空 emoji 直接跳过
      const emoji = (ev.emoji ?? '').trim();
      if (!emoji) { console.warn('[reaction] skip invalid emoji', ev); break; }



      const msg = messages.get(ev.messageId) as LoroMap;
      if (!(msg instanceof LoroMap)) { console.warn('[reaction] skip invalid msg', ev); break; }


      const reactions = ensureContainer(msg, "reactions");
      const perUser = ensureContainer(reactions, emoji);

      if (ev.op === "add") {
        perUser.set(ev.authorId, true);
      } else {
        perUser.delete(ev.authorId);
        // 可选：清理空容器
        // if ((perUser.size ?? 0) === 0) reactions.delete(emoji);
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



function ensureContainer(parent: LoroMap, key: string): LoroMap {
  const cur = parent.get(key);
  if (cur instanceof LoroMap) return cur;
  parent.setContainer(key, new LoroMap());
  return parent.get(key) as LoroMap; // 关键：重新获取“活引用”
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
export function extractReactions(rx: any): Record<string, string[]> {
  const reactions: Record<string, string[]> = {};
  if (rx instanceof LoroMap) {
    for (const emoji of rx.keys()) {
      const per = rx.get(emoji);
      if (per instanceof LoroMap) {
        const users: string[] = [];
        for (const uid of per.keys()) users.push(String(uid));
        if (users.length) reactions[emoji] = users;
      }
    }
  }
  return reactions;
}
