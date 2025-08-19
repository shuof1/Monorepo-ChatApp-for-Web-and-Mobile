import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type {
  ChatEvent,
  Millis,
  EventStorePort,
  SyncEnginePorts,
  ClockPort,
  IdPort,
} from 'sync-engine';

/** Firestore 路径：/chats/{chatId}/events */
const eventsCol = (chatId: string) =>
  firestore().collection('chats').doc(chatId).collection('events');

/** 将 RN Firestore 文档转为 ChatEvent，并把 serverTime 转毫秒 */
const toChatEvent = (raw: FirebaseFirestoreTypes.DocumentData): ChatEvent => {
  const serverTs = raw.serverTime as
    | FirebaseFirestoreTypes.Timestamp
    | undefined;

  const serverTimeMs: Millis | undefined = serverTs?.toMillis();

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
};

/** 最小事件存储实现（在线模式） */
export function createRNEventStore(): EventStorePort {
  return {
    /** 追加事件：写入 serverTimestamp() 供审计/展示 */
    async append(ev: ChatEvent): Promise<void> {
      const data: Record<string, any> = {
        type: ev.type,
        chatId: ev.chatId,
        messageId: ev.messageId,
        authorId: ev.authorId,
        clientId: ev.clientId,
        opId: ev.opId,
        clientTime: ev.clientTime,
        serverTime: firestore.FieldValue.serverTimestamp(),
      };
      if (ev.type === 'create' || ev.type === 'edit') data.text = ev.text;
      await eventsCol(ev.chatId).add(data);
    },

    /** 初始化加载（按 clientTime 升序；可选 since/limit） */
    async list(chatId: string, opts?: { sinceMs?: Millis; limit?: number }) {
      let q = eventsCol(chatId).orderBy('clientTime', 'asc') as
        FirebaseFirestoreTypes.Query<FirebaseFirestoreTypes.DocumentData>;

      if (opts?.sinceMs != null) {
        q = q.where('clientTime', '>=', opts.sinceMs);
      }
      if (opts?.limit != null) {
        q = q.limit(opts.limit);
      }

      const snap = await q.get();
      return snap.docs.map(d => toChatEvent(d.data()));
    },

    /** 实时订阅（只处理新增，在线最小实现） */
    subscribe(chatId: string, onEvent: (ev: ChatEvent) => void, opts?: { sinceMs?: Millis }) {
      let q = eventsCol(chatId).orderBy('clientTime', 'asc');
      // 如果传入了 sinceMs，只查询比它更新的事件
      if (opts?.sinceMs != null) {
        // 使用 "greater than" (>) 而不是 "greater than or equal to" (>=)
        // 来避免把最后一条消息重复加载一次
        q = q.where('clientTime', '>', opts.sinceMs);
      }
      const unsub = q.onSnapshot(snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === 'added') onEvent(toChatEvent(ch.doc.data()));
        });
      });
      return unsub;
    },
  };
}

/** 组合端口（clock + ids + store），供 App 注入 core 使用 */
export function createRNPorts(params: {
  deviceId: string;
  newId: () => string; // 传入 uuid 生成器
}): SyncEnginePorts {
  const clock: ClockPort = { now: () => Date.now() as Millis };
  const ids: IdPort = { deviceId: params.deviceId, newId: params.newId };
  const store = createRNEventStore();
  return { clock, ids, store };
}
