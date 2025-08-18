// src/RNFirestoreAdapter.ts
import firestore from "@react-native-firebase/firestore";
var eventsCol = (chatId) => firestore().collection("chats").doc(chatId).collection("events");
var toChatEvent = (raw) => {
  const serverTs = raw.serverTime;
  const serverTimeMs = serverTs?.toMillis();
  const base = {
    type: raw.type,
    chatId: raw.chatId,
    messageId: raw.messageId,
    authorId: raw.authorId,
    clientId: raw.clientId,
    opId: raw.opId,
    clientTime: raw.clientTime,
    serverTimeMs
  };
  if (raw.type === "create" || raw.type === "edit") {
    return { ...base, text: raw.text ?? "" };
  }
  return base;
};
function createRNEventStore() {
  return {
    /** 追加事件：写入 serverTimestamp() 供审计/展示 */
    async append(ev) {
      const data = {
        type: ev.type,
        chatId: ev.chatId,
        messageId: ev.messageId,
        authorId: ev.authorId,
        clientId: ev.clientId,
        opId: ev.opId,
        clientTime: ev.clientTime,
        serverTime: firestore.FieldValue.serverTimestamp()
      };
      if (ev.type === "create" || ev.type === "edit") data.text = ev.text;
      await eventsCol(ev.chatId).add(data);
    },
    /** 初始化加载（按 clientTime 升序；可选 since/limit） */
    async list(chatId, opts) {
      let q = eventsCol(chatId).orderBy("clientTime", "asc");
      if (opts?.sinceMs != null) {
        q = q.where("clientTime", ">=", opts.sinceMs);
      }
      if (opts?.limit != null) {
        q = q.limit(opts.limit);
      }
      const snap = await q.get();
      return snap.docs.map((d) => toChatEvent(d.data()));
    },
    /** 实时订阅（只处理新增，在线最小实现） */
    subscribe(chatId, onEvent, opts) {
      let q = eventsCol(chatId).orderBy("clientTime", "asc");
      if (opts?.sinceMs != null) {
        q = q.where("clientTime", ">", opts.sinceMs);
      }
      const unsub = q.onSnapshot((snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === "added") onEvent(toChatEvent(ch.doc.data()));
        });
      });
      return unsub;
    }
  };
}
function createRNPorts(params) {
  const clock = { now: () => Date.now() };
  const ids = { deviceId: params.deviceId, newId: params.newId };
  const store = createRNEventStore();
  return { clock, ids, store };
}
export {
  createRNEventStore,
  createRNPorts
};
