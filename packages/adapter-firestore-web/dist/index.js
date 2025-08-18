// src/WebFirestoreAdapter.ts
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit as qLimit,
  getDocs
} from "firebase/firestore";
var eventsCol = (db, chatId) => collection(db, "chats", chatId, "events");
function toChatEvent(raw) {
  const serverTimeMs = raw.serverTime && typeof raw.serverTime.toMillis === "function" ? raw.serverTime.toMillis() : void 0;
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
}
function createWebEventStore(db) {
  return {
    /** 追加事件；写库时带上 serverTimestamp() */
    async append(ev) {
      const docData = {
        type: ev.type,
        chatId: ev.chatId,
        messageId: ev.messageId,
        authorId: ev.authorId,
        clientId: ev.clientId,
        opId: ev.opId,
        clientTime: ev.clientTime,
        serverTime: serverTimestamp()
        // 仅供审计/排序参考
      };
      if (ev.type === "create" || ev.type === "edit") {
        docData.text = ev.text;
      }
      await addDoc(eventsCol(db, ev.chatId), docData);
    },
    /** 初始化加载（在线最小实现：按 clientTime 过滤与排序） */
    async list(chatId, opts) {
      let q = query(eventsCol(db, chatId), orderBy("clientTime", "asc"));
      if (opts?.sinceMs != null) {
        q = query(q, where("clientTime", ">=", opts.sinceMs));
      }
      if (opts?.limit != null) {
        q = query(q, qLimit(opts.limit));
      }
      const snap = await getDocs(q);
      return snap.docs.map((d) => toChatEvent(d.data()));
    },
    /** 实时订阅增量事件（按 clientTime 升序） */
    subscribe(chatId, onEvent, opts) {
      let qy = query(eventsCol(db, chatId), orderBy("clientTime", "asc"));
      if (opts?.sinceMs != null) {
        qy = query(qy, where("clientTime", ">", opts.sinceMs));
      }
      const unsub = onSnapshot(qy, (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === "added") {
            onEvent(toChatEvent(ch.doc.data()));
          }
        });
      });
      return unsub;
    }
  };
}
function createWebPorts(params) {
  const clock = { now: () => Date.now() };
  const ids = {
    deviceId: params.deviceId,
    newId: params.newId
  };
  const store = createWebEventStore(params.db);
  return { clock, ids, store };
}
export {
  createWebEventStore,
  createWebPorts
};
