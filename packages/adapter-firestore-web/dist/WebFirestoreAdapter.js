// packages/adapter-firestore-web/src/WebFirestoreAdapter.ts
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where, limit as qLimit, getDocs, } from 'firebase/firestore';
/** Firestore 事件表路径：/chats/{chatId}/events */
const eventsCol = (db, chatId) => collection(db, 'chats', chatId, 'events');
/** 将 Firestore 文档数据映射为 ChatEvent，并把 serverTime 转为毫秒 */
function toChatEvent(raw) {
    const serverTimeMs = raw.serverTime && typeof raw.serverTime.toMillis === 'function'
        ? raw.serverTime.toMillis()
        : undefined;
    // 仅保留在线模式最小字段，text 仅在 create/edit 存在
    const base = {
        type: raw.type,
        chatId: raw.chatId,
        messageId: raw.messageId,
        authorId: raw.authorId,
        clientId: raw.clientId,
        opId: raw.opId,
        clientTime: raw.clientTime,
        serverTimeMs,
    };
    if (raw.type === 'create' || raw.type === 'edit') {
        return { ...base, text: (raw.text ?? '') };
    }
    return base; // delete
}
/** 仅负责事件读写订阅的最小实现 */
export function createWebEventStore(db) {
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
                serverTime: serverTimestamp(), // 仅供审计/排序参考
            };
            if (ev.type === 'create' || ev.type === 'edit') {
                docData.text = ev.text;
            }
            await addDoc(eventsCol(db, ev.chatId), docData);
        },
        /** 初始化加载（在线最小实现：按 clientTime 过滤与排序） */
        async list(chatId, opts) {
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
        subscribe(chatId, onEvent) {
            const qy = query(eventsCol(db, chatId), orderBy('clientTime', 'asc'));
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
export function createWebPorts(params) {
    const clock = { now: () => Date.now() };
    const ids = {
        deviceId: params.deviceId,
        newId: params.newId,
    };
    const store = createWebEventStore(params.db);
    return { clock, ids, store };
}
