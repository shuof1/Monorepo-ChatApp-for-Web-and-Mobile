// packages/adapter-firestore-web/src/WebFirestoreAdapter.ts
import {
  type Firestore,
  Timestamp,
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit as qLimit,
  getDocs,
} from 'firebase/firestore';
import type {
  ChatEvent,
  Millis,
  EventStorePort,
  SyncEnginePorts,
  ClockPort,
  IdPort,
} from 'sync-engine'

/** Firestore 事件表路径：/chats/{chatId}/events */
const eventsCol = (db: Firestore, chatId: string) =>
  collection(db, 'chats', chatId, 'events');

/** 将 Firestore 文档数据映射为 ChatEvent，并把 serverTime 转为毫秒 */
function toChatEvent(raw: any): ChatEvent {
  const serverTimeMs: Millis | undefined =
    raw.serverTime && typeof raw.serverTime.toMillis === 'function'
      ? (raw.serverTime as Timestamp).toMillis()
      : undefined;

  // 仅保留在线模式最小字段，text 仅在 create/edit 存在
  const base = {
    type: raw.type as ChatEvent['type'],
    chatId: raw.chatId as string,
    messageId: raw.messageId as string,
    authorId: raw.authorId as string,
    clientId: raw.clientId as string,
    opId: raw.opId as string,
    clientTime: raw.clientTime as number,
    serverTimeMs,
  } as const;

  if (raw.type === 'create' || raw.type === 'edit') {
    return { ...base, text: (raw.text ?? '') as string } as ChatEvent;
  }
  return base as ChatEvent; // delete
}

/** 仅负责事件读写订阅的最小实现 */
export function createWebEventStore(db: Firestore): EventStorePort {
  return {
    /** 追加事件；写库时带上 serverTimestamp() */
    async append(ev: ChatEvent): Promise<void> {
      const docData: Record<string, any> = {
        type: ev.type,
        chatId: ev.chatId,
        messageId: ev.messageId,
        authorId: ev.authorId,
        clientId: ev.clientId,
        opId: ev.opId,
        clientTime: ev.clientTime,
        serverTime: serverTimestamp(), // 仅供审计/排序参考
      };
      if (ev.type === 'create' || ev.type === 'edit') {
        docData.text = ev.text;
      }
      await addDoc(eventsCol(db, ev.chatId), docData);
    },

    /** 初始化加载（在线最小实现：按 clientTime 过滤与排序） */
    async list(chatId: string, opts?: { sinceMs?: Millis; limit?: number }) {
      let q = query(eventsCol(db, chatId), orderBy('clientTime', 'asc'));
      if (opts?.sinceMs != null) {
        q = query(q, where('clientTime', '>=', opts.sinceMs));
      }
      if (opts?.limit != null) {
        q = query(q, qLimit(opts.limit));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => toChatEvent(d.data()));
    },

    /** 实时订阅增量事件（按 clientTime 升序） */
    subscribe(chatId: string, onEvent: (ev: ChatEvent) => void, opts?: { sinceMs?: Millis }) {
      // --- 修改点：将 query 的构建移到这里 ---
      let qy = query(eventsCol(db, chatId), orderBy('clientTime', 'asc'));

      // 如果传入了 sinceMs，只查询比它更新的事件
      if (opts?.sinceMs != null) {
        // 使用 "greater than" (>) 而不是 "greater than or equal to" (>=)
        // 来避免把最后一条消息重复加载一次
        qy = query(qy, where('clientTime', '>', opts.sinceMs));
      }
      const unsub = onSnapshot(qy, snap => {
        // 仅处理新增（在线模式最小实现）
        snap.docChanges().forEach(ch => {
          if (ch.type === 'added') {
            onEvent(toChatEvent(ch.doc.data()));
          }
        });
      });
      return unsub;
    },
  };
}

/** 提供给应用的组合端口（clock + ids + store） */
export function createWebPorts(params: {
  db: Firestore;
  deviceId: string;
  newId: () => string; // 传入 uuid 生成器
}): SyncEnginePorts {
  const clock: ClockPort = { now: () => Date.now() as Millis };
  const ids: IdPort = {
    deviceId: params.deviceId,
    newId: params.newId,
  };
  const store = createWebEventStore(params.db);
  return { clock, ids, store };
}
