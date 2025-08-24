// apps/web/lib/engine.ts
"use client";

// import { getFirestore } from "firebase/firestore";
import { getDb } from "./firebase";
import { v4 as uuid } from "uuid";
import { createWebPorts } from "adapter-firestore-web";
import {
    type ChatEvent,
    type ChatMsg,
    type Millis,
} from "sync-engine";
import { LoroDoc } from "loro-crdt";
import { applyEventToLoro, getAllMessagesFromDoc } from "./loro-utils";

import {
    createLocalStorage,
    createOutbox,
} from 'adapter-storage-wm';


/** 依赖注入：组装 ports（clock + ids + store） */
function buildPorts() {
    const db = getDb();
    return createWebPorts({
        db,
        deviceId: "web-" + uuid(),
        newId: uuid,
    });
}

export type Unsubscribe = () => void;

export interface ChatSession {
    /** 当前聚合后的消息（Map<messageId, ChatMsg>） */
    getState(): Map<string, ChatMsg>;
    /** 订阅状态变更（fold 后回调） */
    subscribe(listener: (state: Map<string, ChatMsg>) => void): Unsubscribe;

    /** 在线模式：加载初始事件并开始实时订阅 */
    start(): Promise<void>;
    /** 取消订阅 */
    stop(): void;

    /** 发送事件（最小三件套） */
    create(params: { chatId: string; messageId?: string; text: string; authorId: string }): Promise<void>;
    edit(params: { chatId: string; messageId: string; text: string; authorId: string }): Promise<void>;
    del(params: { chatId: string; messageId: string; authorId: string }): Promise<void>;

    // ✅ 新增
    addReaction(p: { chatId: string; messageId: string; emoji: string; authorId: string }): Promise<void>;
    removeReaction(p: { chatId: string; messageId: string; emoji: string; authorId: string }): Promise<void>;
    toggleReaction(p: { chatId: string; messageId: string; emoji: string; authorId: string }): Promise<void>;
}

/** 为某个 chatId 创建一个会话（状态机 + 订阅） */
export function createChatSession(chatId: string): ChatSession {
    const ports = buildPorts();

    const local = createLocalStorage();
    const outbox = createOutbox();

    const doc = new LoroDoc();

    // let events: ChatEvent[] = [];
    // let state = new Map<string, ChatMsg>();
    const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
    let unsub: Unsubscribe | null = null;
    let started = false;

    // 用于去重
    let lastKnownTime: Millis | undefined = undefined;

    // 简化的同步循环开关
    let syncLoopStarted = false;

    const getStateFromDoc = () => {
        return new Map(getAllMessagesFromDoc(doc).map(msg => [msg.id, msg]));
    }

    async function persistSnapshotById(mid: string) {
        // 只算一条，避免每次都全量 getAll
        const one = getAllMessagesFromDoc(doc).find(m => m.id === mid);
        if (one) {
            await local.upsertFromChatMsg(chatId, one); // ← 上一步你在 LocalStorageAdapter 里已实现
        }
    }

    const notify = () => {
        const state = getStateFromDoc();
        listeners.forEach((fn) => fn(state));
    }

    // —— 从本地快照快速“上屏”（离线可见） —— //
    const notifyFromLocalSnapshot = async () => {
        const msgs = await local.getMessages(chatId, 200); // 取最近 200 条即可
        const state = new Map<string, ChatMsg>();
        for (const m of msgs) {
            const id = (m.remoteId as any) ?? (m as any).id; // remoteId 优先，兜底本地 id
            const createdAt = new Date(m.createdAt);
            const updatedAt = new Date(m.editedAt ?? m.createdAt);
            const payload = (m.payload ?? {}) as { reactions?: Record<string, string[]> };
            // 这里把本地 Message 映射成 ChatMsg（字段最小满足 UI 使用）
            const msg = {
                id,                // 若你的 ChatMsg 用 messageId，这里等价
                messageId: id,
                chatId: m.chatId,
                authorId: m.authorId,
                text: m.text ?? undefined,
                createdAt,
                updatedAt,
                deleted: !!m.deletedAt,
                payload: m.payload ?? undefined,
                reactions: payload.reactions,  // ✅ 关键
            } as unknown as ChatMsg;

            state.set(id, msg);
        }
        listeners.forEach((fn) => fn(state));
    };

    // —— 把远端事件同步到本地快照（供离线重启可见） —— //
    const applyRemoteEventToLocal = async (ev: ChatEvent) => {
        // 某些事件（比如系统 KV）可能没有 messageId，这里防御一下
        if (!ev.messageId) return;
        await persistSnapshotById(ev.messageId);
    };

    // —— Outbox 同步循环（最小实现：定时轮询） —— //
    const ensureSyncLoop = () => {
        if (syncLoopStarted) return;
        syncLoopStarted = true;

        const tick = async () => {
            try {
                const batch = await outbox.peek(10, 5); // 取 10 条，最多重试 5 次
                for (const item of batch) {
                    try {
                        const ev = item.payload as ChatEvent; // 我们 enqueue 的就是完整事件
                        await ports.store.append(ev);         // 上行到后端
                        await persistSnapshotById(ev.messageId);  // ✅ 单条落地（含 reactions）                   
                        await outbox.markDone(item.id);
                    } catch (err) {
                        await outbox.markFailed(item.id, err);
                    }
                }
            } finally {
                setTimeout(tick, 800); // 简单轮询；后续可换网络/可见性驱动
            }
        };

        tick();
    };

    // —— 发送事件的最小封装 —— //
    const base = () => ({
        clientId: ports.ids.deviceId,
        opId: ports.ids.newId(),
        clientTime: ports.clock.now() as Millis,
    });

    // 加一个小型 LRU，避免偶发重复回放（相同 clientTime 的情况）
    const seen = new Set<string>();
    const SEEN_MAX = 1024;
    const markSeen = (opId: string) => { seen.add(opId); if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string); };

    const start = async () => {
        if (started) return;
        started = true;

        // 0) 先用本地快照“上屏”，离线可见
        await notifyFromLocalSnapshot();

        // 1) 初次加载（带 sinceMs）
        const initial = await ports.store.list(chatId, lastKnownTime ? { sinceMs: lastKnownTime } : undefined);
        for (const ev of initial) {
            applyEventToLoro(doc, ev);
            await applyRemoteEventToLocal(ev);
            markSeen(ev.opId);
            lastKnownTime = Math.max(lastKnownTime ?? 0, ev.clientTime);
        }

        await local.setLastClientTime(chatId, lastKnownTime ?? 0);
        notify();
        // 2) 实时订阅（带 sinceMs）
        unsub = ports.store.subscribe(chatId, async (ev) => {
            if (seen.has(ev.opId)) return; // ✅ opId 去重更稳
            applyEventToLoro(doc, ev);
            await applyRemoteEventToLocal(ev);
            markSeen(ev.opId);
            lastKnownTime = Math.max(lastKnownTime ?? 0, ev.clientTime);
            await local.setLastClientTime(chatId, lastKnownTime);
            notify();
        }, lastKnownTime ? { sinceMs: lastKnownTime } : undefined);
        ensureSyncLoop();
    };

    const stop = () => {
        unsub?.();
        unsub = null;
        started = false;
    };



    const create = async (p: { chatId: string; messageId?: string; text: string; authorId: string }) => {
        const ev: ChatEvent = {
            type: "create",
            chatId: p.chatId,
            messageId: p.messageId ?? ports.ids.newId(),
            text: p.text,
            authorId: p.authorId,
            ...base(),
        };

        applyEventToLoro(doc, ev);
        await applyRemoteEventToLocal(ev);
        notify();

        // 3) 入队 outbox，后台同步
        await outbox.enqueue({
            op: "create",
            chatId: p.chatId,
            targetId: ev.messageId,
            dedupeKey: `create:${p.chatId}:${ev.messageId}`,
            lamport: ev.clientTime as number,
            payload: ev, // 直接放完整事件，syncLoop 取出 append
        });
    };

    const edit = async (p: { chatId: string; messageId: string; text: string; authorId: string }) => {
        const ev: ChatEvent = {
            type: "edit",
            chatId: p.chatId,
            messageId: p.messageId,
            text: p.text,
            authorId: p.authorId,
            ...base(),
        };
        applyEventToLoro(doc, ev);
        await applyRemoteEventToLocal(ev);
        notify();

        await outbox.enqueue({
            op: "edit",
            chatId: p.chatId,
            targetId: ev.messageId,
            dedupeKey: `edit:${p.chatId}:${ev.messageId}:${ev.clientTime}`,
            lamport: ev.clientTime as number,
            payload: ev,
        });
    };

    const del = async (p: { chatId: string; messageId: string; authorId: string }) => {
        const ev: ChatEvent = {
            type: "delete",
            chatId: p.chatId,
            messageId: p.messageId,
            authorId: p.authorId,
            ...base(),
        };
        applyEventToLoro(doc, ev);
        await applyRemoteEventToLocal(ev);
        notify();

        await outbox.enqueue({
            op: "delete",
            chatId: p.chatId,
            targetId: ev.messageId,
            dedupeKey: `delete:${p.chatId}:${ev.messageId}:${ev.clientTime}`,
            lamport: ev.clientTime as number,
            payload: ev,
        });
    };

    async function emitReaction(
        op: 'add' | 'remove',
        p: { chatId: string; messageId: string; emoji: string; authorId: string }
    ) {
        const emoji = (p.emoji ?? '').trim();
        if (!emoji) return; // ✅ 防止坏事件
        const ev: ChatEvent = {
            type: 'reaction',
            chatId: p.chatId,
            messageId: p.messageId,
            emoji: p.emoji,
            op,
            authorId: p.authorId,
            ...base(), // 提供 clientId / opId / clientTime
        };

        // 1) 本地乐观应用
        applyEventToLoro(doc, ev);
        await applyRemoteEventToLocal(ev);
        notify();

        // 2) 入队 outbox（与 edit/delete 相同风格，使用 clientTime 做去重 key 的一部分）
        await outbox.enqueue({
            op: 'reaction',
            chatId: p.chatId,
            targetId: ev.messageId,
            // 含 op/emoji/authorId，避免不同操作或不同表情被错误合并
            dedupeKey: `reaction:${p.chatId}:${ev.messageId}:${p.emoji}:${p.authorId}:${ev.clientTime}`,
            lamport: ev.clientTime as number,
            payload: ev,
        });
    }

    const addReaction = (p: { chatId: string; messageId: string; emoji: string; authorId: string }) =>
        emitReaction('add', p);

    const removeReaction = (p: { chatId: string; messageId: string; emoji: string; authorId: string }) =>
        emitReaction('remove', p);

    const toggleReaction = async (p: { chatId: string; messageId: string; emoji: string; authorId: string }) => {
        // 直接用当前聚合后的内存状态判断是否已点
        const cur = getStateFromDoc().get(p.messageId);
        const has = !!cur?.reactions?.[p.emoji]?.includes(p.authorId);
        await emitReaction(has ? 'remove' : 'add', p);
    };

    return {
        getState: () => getStateFromDoc(),
        subscribe(fn) {
            listeners.add(fn);
            // 立即推送一次
            fn(getStateFromDoc());
            return () => listeners.delete(fn);
        },
        start,
        stop,
        create,
        edit,
        del,
        // ✅ 新增的 reaction API（供 hook / UI 调用）
        addReaction,
        removeReaction,
        toggleReaction,
    };
}
