// apps/web/lib/engine.ts
"use client";

// import { getFirestore } from "firebase/firestore";
import { getDb } from "./firebase";
import { v4 as uuid } from "uuid";
// import { createWebPorts } from "adapter-firestore-web";
import {
    type ChatEvent,
    type ChatMsg,
    type Millis,
    type E2EEInvite,
    E2EEAck,
} from "sync-engine";
import { LoroDoc } from "loro-crdt";
import { applyEventToLoro, getAllMessagesFromDoc } from "./loro-utils";

import {
    createLocalStorage,
    getOutboxAdapterSingleton,
    getOutBoxRunnerSingleton
} from 'adapter-storage-wm';
import { LoroText, LoroMap } from 'loro-crdt';
import { getMessageFromDoc } from '../utils/loro-readers';
import { ensureDeviceId, ensureClientId } from "./device";
import * as sodium from 'libsodium-wrappers';

const deviceId = ensureDeviceId();     // ✅ 稳定、持久
const clientId = ensureClientId();     // ✅ 路由/Outbox用，可重置
const local = createLocalStorage();

// ---- E2EE keys & utils (minimal) ----
type DeviceKeyPair = { pub: string; priv: string }; // base64 raw
type DeviceKeys = { deviceId: string; clientId: string; x25519: DeviceKeyPair; ed25519?: DeviceKeyPair };

const ab = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const b64 = (buf: ArrayBuffer | Uint8Array) => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
};

async function genEd25519(): Promise<DeviceKeyPair> {
    const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
    const priv = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
    return { pub: b64(pub), priv: b64(priv) };
}

async function genX25519(): Promise<DeviceKeyPair> {
    await sodium.ready;
    const keypair = sodium.crypto_kx_keypair();
    return {
        pub: b64(keypair.publicKey),
        priv: b64(keypair.privateKey),
    };
}

async function importX25519Priv(b64pkcs8: string) {
    return await crypto.subtle.importKey("pkcs8", ab(b64pkcs8), { name: "X25519" }, false, ["deriveBits"]);
}
async function importX25519Pub(b64raw: string) {
    return await crypto.subtle.importKey("raw", ab(b64raw), { name: "X25519" }, false, []);
}
async function importEd25519Priv(b64pkcs8: string) {
    return await crypto.subtle.importKey("pkcs8", ab(b64pkcs8), { name: "Ed25519" }, false, ["sign"]);
}
async function importEd25519Pub(b64raw: string) {
    return await crypto.subtle.importKey("raw", ab(b64raw), { name: "Ed25519" }, false, ["verify"]);
}

// —— 稳定序列化：按 key 排序 + 过滤 undefined —— //
function canonical(...objs: any[]): Uint8Array {
    const stable = (o: any): any =>
        Array.isArray(o)
            ? o.map(stable)
            : o && typeof o === "object"
                ? Object.keys(o)
                    .filter(k => o[k] !== undefined)
                    .sort()
                    .reduce((acc, k) => { acc[k] = stable(o[k]); return acc; }, {} as any)
                : o;
    const s = JSON.stringify(objs.map(stable));
    return new TextEncoder().encode(s);
}

function toArrayBuffer(src: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (src instanceof ArrayBuffer) return src;
    // 只取有效视图区域，避免把整个底层 buffer 传进去
    const { buffer, byteOffset, byteLength } = src;
    return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}
// —— Ed25519 签名/验签（用你已有的 importEd25519Priv / importEd25519Pub） —— //
async function signEd25519Bytes(bytes: Uint8Array, privB64: string): Promise<string> {
    const sk = await importEd25519Priv(privB64);
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, sk, toArrayBuffer(bytes));
    return b64(sig); // 仍用你现有的 base64
}

async function verifyEd25519Bytes(bytes: Uint8Array, sigB64: string, pubB64: string): Promise<boolean> {
    if (!sigB64 || !pubB64) return false;
    const pk = await importEd25519Pub(pubB64);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, pk, ab(sigB64), toArrayBuffer(bytes));
    return !!ok;
}

async function ensureDeviceKeys(local: ReturnType<typeof createLocalStorage>, deviceId: string, clientId: string): Promise<DeviceKeys> {
    const didKey = 'kv:e2ee:me:deviceId';
    const cidKey = 'kv:e2ee:me:clientId';
    const xkKey = 'kv:e2ee:me:x25519';
    const skKey = 'kv:e2ee:me:ed25519';

    let savedDid = await local.getKv<string>(didKey);
    let savedCid = await local.getKv<string>(cidKey);
    let x25519 = await local.getKv<DeviceKeyPair>(xkKey);
    let ed25519 = await local.getKv<DeviceKeyPair>(skKey);

    // 首次生成
    if (!x25519) x25519 = await genX25519();
    if (!ed25519) ed25519 = await genEd25519();

    if (savedDid !== deviceId) await local.setKv(didKey, deviceId);
    if (savedCid !== clientId) await local.setKv(cidKey, clientId);
    await local.setKv(xkKey, x25519);
    await local.setKv(skKey, ed25519);

    return { deviceId, clientId, x25519, ed25519 };
}


async function sendInvite(chatId: string, inviterUserId: string, inviteeUserId: string):
    Promise<E2EEInvite> {
    const me = await ensureDeviceKeys(local, deviceId, clientId);
    const header: E2EEInvite['header'] = {
        v: 1,
        type: 'e2ee_invite',
        chatId,
        messageId: uuid(),
        authorId: inviterUserId,
        clientId: me.clientId,
        clientTime: now(),
        opId: uuid(),
        target: { userId: inviteeUserId },
    };
    const body: E2EEInvite['body'] = {
        inviterUserId,
        inviterDeviceId: deviceId,
        inviterClientId: me.clientId,
        inviterDevicePubX25519: me.x25519.pub,
        inviterSignPubEd25519: me.ed25519?.pub,
        suggestedChatId: chatId,

    };

    // ★ 生成签名
    if (!me.ed25519?.priv) throw new Error("Ed25519 private key missing");
    const bytes = canonical(header, body);
    const sig = await signEd25519Bytes(bytes, me.ed25519.priv);

    const invite: E2EEInvite = { header, body, sig };
    await apiAppendWire(invite as any);
    return invite;

}

async function sendAck(invite: E2EEInvite, accepterUserId: string): Promise<E2EEAck> {

    const me = await ensureDeviceKeys(local, deviceId, clientId);

    // ★ 先验签对方 Invite
    {
        const bytes = canonical(invite.header, invite.body);
        const ok = await verifyEd25519Bytes(
            bytes,
            invite.sig || "",
            // 优先用包里携带的 signer 公钥；也可回退到你本地/Firestore 已缓存的设备公钥
            invite.body.inviterSignPubEd25519 || ""
        );
        if (!ok) throw new Error("Invalid invite signature");
    }

    // 再存 A 的公钥信息（后续导出根密钥用）
    const peer = {
        clientId: invite.body.inviterClientId ?? invite.header.clientId,
        x25519Pub: invite.body.inviterDevicePubX25519,
        deviceId: invite.body.inviterDeviceId,
        signPubEd25519: invite.body.inviterSignPubEd25519,
    };
    await local.setKv(`kv:e2ee:peer:${invite.body.suggestedChatId}`, peer);
    const header: E2EEAck["header"] = {
        v: 1,
        type: "e2ee_ack",
        chatId: invite.body.suggestedChatId,
        messageId: newId(),
        authorId: accepterUserId,
        clientId: me.clientId,
        clientTime: now(),
        opId: newId(),
        target: {
            userId: invite.header.authorId,
            clientId: invite.header.clientId,   // ✅ 用 clientId 精确回发
            deviceId: invite.body.inviterDeviceId, // 可选附带
        },
    };

    const body: E2EEAck["body"] = {
        accepterUserId,
        accepterDeviceId: deviceId,           // ✅ 新增：携带本机 deviceId
        accepterClientId: me.clientId,
        accepterDevicePubX25519: me.x25519.pub,
        accepterSignPubEd25519: me.ed25519?.pub,
        acceptedChatId: invite.body.suggestedChatId,
    };

    // ★ 对 Ack 也签名
    if (!me.ed25519?.priv) throw new Error("Ed25519 private key missing");
    const bytes = canonical(header, body);
    const sig = await signEd25519Bytes(bytes, me.ed25519.priv);

    const ack: E2EEAck = { header, body, sig };
    await apiAppendWire(ack as any);
    return ack;
}

const newId = uuid;
const now = () => Date.now() as Millis;
const API_BASE = "/api/events";

// 列表：GET /api/events?chatId&sinceMs&limit
async function apiList(chatId: string, opts?: { sinceMs?: Millis; limit?: number }): Promise<ChatEvent[]> {
    const url = new URL(API_BASE, location.origin);
    url.searchParams.set("chatId", chatId);
    if (opts?.sinceMs != null) url.searchParams.set("sinceMs", String(opts.sinceMs));
    if (opts?.limit != null) url.searchParams.set("limit", String(opts.limit));
    const res = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error(`list ${res.status}`);
    return (await res.json()) as ChatEvent[];
}

async function apiAppendWire(ev: any): Promise<void> {
    const res = await fetch(API_BASE, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
    });
    if (!res.ok) throw new Error(`append ${res.status}`);
}

// 追加：POST /api/events
async function apiAppend(ev: ChatEvent): Promise<void> {
    await fetch(API_BASE, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
    }).then(r => { if (!r.ok) throw new Error(`append ${r.status}`); });
}

async function apiAppendStrict(ev: ChatEvent): Promise<void> {
    try {
        const res = await fetch("/api/events", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ev),
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.warn("[Outbox] POST fail", res.status, txt);
            if (res.status >= 500) throw new Error(`retryable ${res.status}`);
            // 401/403 这类：暂停等待登录（仍抛错，runner 会保留队列）
            throw new Error(`fatal ${res.status}`);
        }
    } catch (e) {
        console.warn("[Outbox] network error", String(e));
        throw e; // 一定要抛
    }
}

function apiSubscribe(
    chatId: string,
    onEvent: (ev: ChatEvent) => void,
    opts?: { sinceMs?: Millis }
) {
    const qp = new URLSearchParams({ chatId });
    if (opts?.sinceMs != null) qp.set("sinceMs", String(opts.sinceMs));

    let closed = false;
    let es: EventSource | null = null;
    let pollUnsub: (() => void) | null = null;

    // 优先 SSE
    if (typeof window !== "undefined" && "EventSource" in window) {
        es = new EventSource(`/api/events/stream?${qp.toString()}`, { withCredentials: true } as any);
        es.onmessage = (e) => { if (!closed && e.data) onEvent(JSON.parse(e.data)); };
        es.onerror = () => {
            // 某些代理/本地环境不支持 SSE 时切回轮询
            if (!closed && !pollUnsub) {
                es?.close?.();
                pollUnsub = apiSubscribePolling(chatId, onEvent, opts);
            }
        };
        return () => { closed = true; es?.close?.(); pollUnsub?.(); };
    }

    // 不支持 SSE 的环境：直接轮询
    return apiSubscribePolling(chatId, onEvent, opts);

    // 轮询兜底（含退避 + 页面隐藏降频 + 可停止）
    function apiSubscribePolling(
        chatId: string,
        onEvent: (ev: ChatEvent) => void,
        opts?: { sinceMs?: Millis }
    ) {
        let stopped = false;
        let cursor = opts?.sinceMs ?? 0;
        let t: any = null;
        let interval = 1200; const MIN = 1200, MAX = 30000;

        const schedule = (ms: number) => { if (!stopped) t = setTimeout(tick, ms); };

        const tick = async () => {
            if (stopped) return;
            try {
                const arr = await apiList(chatId, { sinceMs: cursor });
                if (arr.length > 0) {
                    for (const ev of arr) {
                        onEvent(ev);
                        cursor = Math.max(cursor, (ev.serverTimeMs ?? ev.clientTime) as number);
                    }
                    interval = MIN;
                } else {
                    interval = Math.min(MAX, interval * 1.6);
                }
            } catch {
                interval = Math.min(MAX, interval * 1.6);
            } finally {
                if (document?.hidden) interval = Math.max(interval, 10000);
                schedule(interval);
            }
        };

        schedule(0);
        return () => { stopped = true; if (t) clearTimeout(t); t = null; };
    }
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
    // ✅ 新增
    inviteE2EE(inviterUserId: string, inviteeUserId: string ): Promise<E2EEInvite>;
    acceptE2EE( invite: E2EEInvite, accepterUserId: string ): Promise<E2EEAck>;
}


let __runner: ReturnType<typeof getOutBoxRunnerSingleton> | null = null;
function waitUntilOnline(): Promise<void> {
    if (typeof window === 'undefined' || navigator.onLine) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const on = () => { window.removeEventListener('online', on); resolve(); };
        window.addEventListener('online', on, { once: true });
    });
}
export function ensureOutboxRunnerOnce() {
    const g = globalThis as any;
    if (g.__wm_runner) return;

    console.log('[Runner] init creating singleton…');

    __runner = getOutBoxRunnerSingleton(
        async (item) => {
            const ev = item.payload as ChatEvent;
            if (!ev?.type) { console.warn('[Outbox] skip empty payload item'); return; }

            console.log('[Outbox] dispatch begin', { opId: ev.opId, type: ev.type, online: navigator.onLine });

            // ❌ 不要 throw offline；✅ 改为挂起直到恢复网络
            if (!navigator.onLine) {
                console.warn('[Outbox] offline, suspend until online', { opId: ev.opId, type: ev.type });
                await waitUntilOnline();
                console.log('[Outbox] resumed (online)', { opId: ev.opId, type: ev.type });
            }

            await apiAppendStrict(ev);                 // 成功/失败里都有日志
            console.log('[Outbox] dispatch success', { opId: ev.opId, type: ev.type });
        },
        { batchSize: 10, idleMs: 1000, jitterMs: 300 }
    );

    g.__wm_runner = __runner;
    console.log('[Runner] start() …');
    __runner.start?.();
}

// 统一唤醒
function kickOutbox() {
    if (!__runner) {
        console.warn('[Runner] kick ignored: not initialized yet');
        return;
    }
    console.log('[Runner] kick/start');
    __runner.start?.();   // 如果库里有 kick() 就用 kick()
}
// 在 start() 里，只注册一次监听（放到 ensureOutboxRunnerOnce 后）
let __onlineBound = false;
function bindOnlineWakeOnce() {
    if (__onlineBound) return;
    __onlineBound = true;
    window.addEventListener('online', kickOutbox);
    window.addEventListener('visibilitychange', () => {
        if (!document.hidden) kickOutbox();
    });
}



/** 为某个 chatId 创建一个会话（状态机 + 订阅） */
export function createChatSession(chatId: string,
    hooks?: {
        onInvite?: (invite: E2EEInvite) => void;
        onAck?: (ack: E2EEAck) => void;
    }
): ChatSession {
    // const ports = buildPorts();


    // const outbox = createOutbox();
    const outbox = getOutboxAdapterSingleton();
    const doc = new LoroDoc();


    // let events: ChatEvent[] = [];
    // let state = new Map<string, ChatMsg>();
    const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
    let unsub: Unsubscribe | null = null;
    let started = false;


    const getStateFromDoc = () => {
        return new Map(getAllMessagesFromDoc(doc).map(msg => [msg.id, msg]));
    }

    async function persistSnapshotById(mid: string) {
        // 只算一条，避免每次都全量 getAll
        const one = getMessageFromDoc(doc, mid);
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
            const updatedAt = m.editedAt ? new Date(m.editedAt) : undefined;
            const payload = (m.payload ?? {}) as { reactions?: Record<string, string[]> };
            // 这里把本地 Message 映射成 ChatMsg（字段最小满足 UI 使用）
            const msg = {
                id,                // 若你的 ChatMsg 用 messageId，这里等价
                messageId: id,
                chatId: m.chatId,
                authorId: m.authorId,
                text: m.text ?? undefined,
                createdAt,
                ...(updatedAt && updatedAt.getTime() > createdAt.getTime() ? { updatedAt } : {}),
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


    // —— 发送事件的最小封装 —— //
    const base = () => ({
        clientId,
        opId: newId(),
        clientTime: now(),
    });

    // 加一个小型 LRU，避免偶发重复回放（相同 clientTime 的情况）
    const seen = new Set<string>();
    const SEEN_MAX = 1024;
    const markSeen = (opId: string) => { seen.add(opId); if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string); };
    
    const start = async () => {
        if (started) return;
        started = true;
        ensureOutboxRunnerOnce();   // 确保 Outbox Runner 启动
        bindOnlineWakeOnce();
        await ensureDeviceKeys(local, deviceId, clientId);
        // 0) 先用本地快照“上屏”，离线可见
        await notifyFromLocalSnapshot();
        await hydrateDocFromLocalSnapshot();
        let lastServerMs = await local.getKv<number>(`cursor:serverTime:${chatId}`) ?? 0;

        // 1) 初次加载（带 sinceMs）
        const initial = await apiList(chatId, lastServerMs ? { sinceMs: lastServerMs } : undefined);
        for (const ev of initial) {
            applyEventToLoro(doc, ev);
            await applyRemoteEventToLocal(ev);
            markSeen(ev.opId);
            lastServerMs = Math.max(lastServerMs, ev.serverTimeMs ?? ev.clientTime);
        }
        await local.setKv(`cursor:serverTime:${chatId}`, lastServerMs);

        notify();
        // 2) 实时订阅（带 sinceMs）
        unsub = apiSubscribe(chatId, async (ev) => {
            if (seen.has(ev.opId)) return; // ✅ opId 去重更稳

            const h = (ev as any).header;
            if (h?.type === 'e2ee_invite') {
                const invite = ev as unknown as E2EEInvite;
                (hooks?.onInvite)?.(invite);
                console.log('[ChatSession] received e2ee_invite event, skipping applyEventToLoro', { opId: ev.opId });
                return;
            }
            if (h?.type === 'e2ee_ack') {
                const ack = ev as unknown as E2EEAck;
                (hooks?.onAck)?.(ack);
                console.log('[ChatSession] received e2ee_ack event, skipping applyEventToLoro', { opId: ev.opId });
                return;
            }

            applyEventToLoro(doc, ev);

            await applyRemoteEventToLocal(ev);
            markSeen(ev.opId);
            lastServerMs = Math.max(lastServerMs, ev.serverTimeMs ?? ev.clientTime);
            await local.setKv(`cursor:serverTime:${chatId}`, lastServerMs);
            notify();


        }, lastServerMs ? { sinceMs: lastServerMs } : undefined);
        // ensureSyncLoop();
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
            messageId: p.messageId ?? newId(),
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
        console.log('[Outbox] enqueued', { type: 'create', opId: ev.opId, msgId: ev.messageId, online: navigator.onLine });
        kickOutbox();
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
        console.log('[Outbox] enqueued', { type: 'create', opId: ev.opId, msgId: ev.messageId, online: navigator.onLine });
        kickOutbox();
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
        console.log('[Outbox] enqueued', { type: 'create', opId: ev.opId, msgId: ev.messageId, online: navigator.onLine });
        kickOutbox();
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
            payload: ev, // ← 存入规范化后的 emoji
        });
        console.log('[Outbox] enqueued', { type: 'create', opId: ev.opId, msgId: ev.messageId, online: navigator.onLine });
        kickOutbox();
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

    async function hydrateDocFromLocalSnapshot() {
        const msgs = await local.getMessages(chatId, 200);
        const messagesMap = doc.getMap('messages');

        for (const m of msgs) {
            // 新（不要回退到本地 id）
            const id = (m as any).remoteId;
            if (!id) continue;
            if (messagesMap.get(id) instanceof LoroMap) continue; // 已存在就跳过

            const msg = new LoroMap();
            // text
            const text = new LoroText();
            text.insert(0, m.text ?? '');
            msg.setContainer('text', text);
            // 基本字段
            msg.set('authorId', m.authorId);
            msg.set('createdAt', m.createdAt);
            if (m.editedAt && new Date(m.editedAt).getTime() > new Date(m.createdAt).getTime()) {
                msg.set('updatedAt', m.editedAt);
            }
            if (m.deletedAt) msg.set('deleted', true);

            // 可选：把快照里的 reactions 也回灌（没有也不影响）
            const payload = (m.payload ?? {}) as { reactions?: Record<string, string[]> };
            const rx = new LoroMap();
            for (const [emoji, users] of Object.entries(payload.reactions ?? {})) {
                const per = new LoroMap();
                for (const uid of users) per.set(uid, true);
                rx.setContainer(emoji, per);
            }
            msg.setContainer('reactions', rx);


            messagesMap.setContainer(id, msg);
        }
    }

    async function inviteE2EE(inviterUserId: string, inviteeUserId: string) {
        return await sendInvite(chatId, inviterUserId, inviteeUserId);
    }

    async function acceptE2EE(invite: E2EEInvite, accepterUserId: string) {
        return await sendAck(invite, accepterUserId);
    }

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
        // ✅ 新增
        inviteE2EE,
        acceptE2EE,
    };
}
