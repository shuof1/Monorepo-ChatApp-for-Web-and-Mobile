import { LoroDoc, LoroMap, LoroList, LoroText } from "loro-react-native";
import type { ChatEvent, ChatMsg } from "sync-engine";

// RN 绑定有的叫 toVec；兜底兼容
const listToArray = (list: any): any[] =>
  typeof list.toVec === "function" ? list.toVec() : list.toArray?.() ?? [];

export { applyEventToLoro, getAllMessagesFromDoc };
function applyEventToLoro(doc: LoroDoc, ev: ChatEvent): void {
  const messages = doc.getMap("messages");

  switch (ev.type) {
    case "create": {
      const msgMap = new LoroMap();
      const text = new LoroText();
      text.insert(0, ev.text);

      msgMap.insertContainer("text", text);
      msgMap.set("authorId", ev.authorId);
      msgMap.set("createdAt", ev.clientTime);
      msgMap.insertContainer("reactions", new LoroMap());
      msgMap.insertContainer("replies", new LoroList());

      if (ev.replyTo) {
        msgMap.set("replyTo", ev.replyTo);
        const target = messages.get(ev.replyTo);
        if (target instanceof LoroMap) {
          const replies = target.get("replies") as unknown as LoroList;
          replies?.push(ev.messageId);
        }
      }
      messages.insertContainer(ev.messageId, msgMap);
      break;
    }

    case "edit": {
      const msg = messages.get(ev.messageId);
      if (msg instanceof LoroMap) {
        const text = msg.get("text")as unknown as LoroText;
        text.delete_(0, (text as any).length ?? text.toString().length);
        text.insert(0, ev.text);
        msg.set("updatedAt", ev.clientTime);
      }
      break;
    }

    case "delete": {
      const msg = messages.get(ev.messageId);
      if (msg instanceof LoroMap) msg.set("deleted", true);
      break;
    }

    case "reaction": {
      const msg = messages.get(ev.messageId);
      if (msg instanceof LoroMap) {
        const reactions = msg.get("reactions")as unknown as LoroMap;
        let list = reactions.get(ev.emoji)as unknown as LoroList;
        if (!list) {
          list = new LoroList();
          reactions.insertContainer(ev.emoji, list);
        }
        const arr = listToArray(list);
        const idx = arr.indexOf(ev.authorId);
        if (ev.op === "add" && idx === -1) list.push(ev.authorId);
        else if (ev.op === "remove" && idx !== -1) list.delete_(idx, 1);
      }
      break;
    }

    case "reply":
      applyEventToLoro(doc, { ...ev, type: "create" });
      break;
  }
}

function getAllMessagesFromDoc(doc: LoroDoc): ChatMsg[] {
  const messages = doc.getMap("messages");
  const out: ChatMsg[] = [];

  for (const [id] of messages.keys()) {
    const v= messages.get(id);
    if (v instanceof LoroMap) {
      const text = v.get("text") as unknown as LoroText;
      const replies = v.get("replies") as unknown as LoroList;
      const reactions = v.get("reactions") as unknown as LoroMap;

      out.push({
        id,
        text: text.toString(),
        authorId: v.get("authorId")as unknown as string,
        createdAt: new Date(v.get("createdAt")as unknown as number),
        updatedAt: v.get("updatedAt") ? new Date(v.get("updatedAt")as unknown as number) : undefined,
        deleted: (v.get("deleted")as unknown as boolean) ?? false,
        replyTo: v.get("replyTo")as unknown as string | undefined,
        replies: listToArray(replies) as string[],
        reactions: extractReactions(reactions),
      });
    }
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function extractReactions(map?: LoroMap): Record<string, string[]> {
  if (!map) return {};
  const obj: Record<string, string[]> = {};
  for (const [emoji] of map.keys()) {
    const userList = map.get(emoji);
    if (userList instanceof LoroList) obj[emoji] = listToArray(userList) as string[];
  }
  return obj;
}
