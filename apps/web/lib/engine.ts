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

    let events: ChatEvent[] = [];
    let state = new Map<string, ChatMsg>();
    const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
    let unsub: Unsubscribe | null = null;
    let started = false;

    const notify = () => {
        // 重新 fold 也可以，但这里对增量小优化：先简单全量 fold（最小实现）
        state = foldEvents(events);
        listeners.forEach((fn) => fn(state));
    };

    const start = async () => {
        if (started) return;
        started = true;

        // 1) 初次加载（可根据需要传 sinceMs/limit）
        const initial = await ports.store.list(chatId);
        events = events.concat(initial);
        notify();

        // --- 新增逻辑 ---
        // 找到本地最新事件的时间戳
        let lastKnownTime: Millis | undefined = undefined;
        if (events.length > 0) {
            // 假设 events 已经按 clientTime 升序排列
            lastKnownTime = events[events.length - 1].clientTime;
        }
        // 2) 实时订阅
        unsub = ports.store.subscribe(chatId, (ev) => {
            if(ev.clientTime === lastKnownTime){
                if(events.some(e => e.opId === ev.opId)) {
                    // 忽略重复的事件
                    return;
                }
            }
            events.push(ev);
            notify();
        });
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
        await ports.store.append(ev);
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
        await ports.store.append(ev);
    };

    const del = async (p: { chatId: string; messageId: string; authorId: string }) => {
        const ev: ChatEvent = {
            type: "delete",
            chatId: p.chatId,
            messageId: p.messageId,
            authorId: p.authorId,
            ...base(),
        };
        await ports.store.append(ev);
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
