// apps/web/lib/engine.ts
"use client";

// import { getFirestore } from "firebase/firestore";
import { getDb } from "./firebase";
import { v4 as uuid } from "uuid";
import { createWebPorts } from "adapter-firestore-web";
import {
    foldEvents,
    type ChatEvent,
    type ChatMsg,
    type Millis,
} from "sync-engine";

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
}

/** 为某个 chatId 创建一个会话（状态机 + 订阅） */
export function createChatSession(chatId: string): ChatSession {
    const ports = buildPorts();

    const local = createLocalStorage();
    const outbox = createOutbox();

    let events: ChatEvent[] = [];
    let state = new Map<string, ChatMsg>();
    const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
    let unsub: Unsubscribe | null = null;
    let started = false;

    // 用于去重
    let lastKnownTime: Millis | undefined = undefined;

    // 简化的同步循环开关
    let syncLoopStarted = false;

    // —— 从本地快照快速“上屏”（离线可见） —— //
    const notifyFromLocalSnapshot = async () => {
        const msgs = await local.getMessages(chatId, 200); // 取最近 200 条即可
        const map = new Map<string, ChatMsg>();
        for (const m of msgs) {
            const id = (m.remoteId as any) ?? (m as any).id; // remoteId 优先，兜底本地 id
            const createdAt = new Date(m.createdAt);
            const updatedAt = new Date(m.editedAt ?? m.createdAt);

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
            } as unknown as ChatMsg;

            map.set(id, msg);
        }
        state = map;
        listeners.forEach((fn) => fn(state));
    };

    // —— 把远端事件同步到本地快照（供离线重启可见） —— //
    const applyRemoteEventToLocal = async (ev: ChatEvent) => {
        const t = (ev.clientTime as number) ?? Date.now();
        if (ev.type === "create") {
            await local.upsertMessage({
                remoteId: ev.messageId,
                chatId: ev.chatId,
                authorId: ev.authorId,
                text: ev.text ?? null,
                sortKey: t,
                createdAt: t,
                status: "sent",
                payload: null,
                localOnly: false,
            });
        } else if (ev.type === "edit") {
            await local.upsertMessage({
                remoteId: ev.messageId,
                chatId: ev.chatId,
                authorId: ev.authorId,
                text: ev.text ?? null,
                sortKey: t,
                createdAt: t,        // 可保留原 createdAt；最小实现用当前 t
                editedAt: t,
                status: "sent",
                payload: null,
                localOnly: false,
            });
        } else if (ev.type === "delete") {
            await local.upsertMessage({
                remoteId: ev.messageId,
                chatId: ev.chatId,
                authorId: ev.authorId,
                text: null,
                sortKey: t,
                createdAt: t,
                deletedAt: t,
                status: "sent",
                payload: null,
                localOnly: false,
            });
        }
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

                        // 上行成功 → 本地消息状态置为 sent + localOnly=false
                        const t = (ev.clientTime as number) ?? Date.now();
                        await local.upsertMessage({
                            remoteId: ev.messageId,
                            chatId: ev.chatId,
                            authorId: ev.authorId,
                            text: ev.type === 'delete' ? null : (ev as any).text ?? null,
                            sortKey: t,
                            createdAt: t,
                            editedAt: ev.type === 'edit' ? t : null,
                            deletedAt: ev.type === 'delete' ? t : null,
                            status: "sent",
                            localOnly: false,
                        });

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

    // —— 通知订阅者 —— //
    const notifyFromEvents = () => {
        state = foldEvents(events);
        listeners.forEach((fn) => fn(state));
    };


    const notify = (from: "events" | "local") =>
        from === "events" ? notifyFromEvents() : notifyFromLocalSnapshot();

    // const notify = () => {
    //     // 重新 fold 也可以，但这里对增量小优化：先简单全量 fold（最小实现）
    //     state = foldEvents(events);
    //     listeners.forEach((fn) => fn(state));
    // };

    const start = async () => {
        console.log("[Engine] Starting session for chatId:", chatId)
        if (started) return;
        started = true;
        
        // 1) 先用本地快照“上屏”，离线可见
        await notify("local");
        console.log("[Engine] Notified from local snapshot. Current state size:", state.size);

        // 1) 初次加载（可根据需要传 sinceMs/limit）
        const initial = await ports.store.list(chatId);
        events = events.concat(initial);
        notify("events");

        // --- 新增逻辑 ---
        // 找到本地最新事件的时间戳
        // let lastKnownTime: Millis | undefined = undefined;
        if (events.length > 0) {
            // 假设 events 已经按 clientTime 升序排列
            lastKnownTime = events[events.length - 1].clientTime;
        }
        // 2) 实时订阅
        unsub = ports.store.subscribe(chatId, async (ev) => {
            if (lastKnownTime && ev.clientTime === lastKnownTime) {
                if (events.some(e => e.opId === ev.opId)) {
                    // 忽略重复的事件
                    return;
                }
            }
            events.push(ev);
            notify("events");
            await applyRemoteEventToLocal(ev);
            lastKnownTime = ev.clientTime;
        });
        ensureSyncLoop();
    };

    const stop = () => {
        unsub?.();
        unsub = null;
        started = false;
    };

    // —— 发送事件的最小封装 —— //
    const base = () => ({
        clientId: ports.ids.deviceId,
        opId: ports.ids.newId(),
        clientTime: ports.clock.now() as Millis,
    });

    const create = async (p: { chatId: string; messageId?: string; text: string; authorId: string }) => {
        const ev: ChatEvent = {
            type: "create",
            chatId: p.chatId,
            messageId: p.messageId ?? ports.ids.newId(),
            text: p.text,
            authorId: p.authorId,
            ...base(),
        };
        // 1) 本地快照乐观写
        await applyRemoteEventToLocal(ev);

        // 2) events 增量 & 通知（UI 即刻可见）
        events.push(ev);
        notify("events");

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
        await applyRemoteEventToLocal(ev);
        events.push(ev);
        notify("events");

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
        await applyRemoteEventToLocal(ev);
        events.push(ev);
        notify("events");

        await outbox.enqueue({
            op: "delete",
            chatId: p.chatId,
            targetId: ev.messageId,
            dedupeKey: `delete:${p.chatId}:${ev.messageId}:${ev.clientTime}`,
            lamport: ev.clientTime as number,
            payload: ev,
        });
    };

    return {
        getState: () => state,
        subscribe(fn) {
            listeners.add(fn);
            // 立即推送一次
            fn(state);
            return () => listeners.delete(fn);
        },
        start,
        stop,
        create,
        edit,
        del,
    };
}
