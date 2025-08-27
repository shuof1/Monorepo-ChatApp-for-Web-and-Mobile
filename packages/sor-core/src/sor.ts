/*
 * sor-core/src/sor.ts
 * ------------------------------------------------------------
 * Source-of-Record (SoR) core primitives for an offline-first chat app.
 *
 * Goals:
 *  - Pure TypeScript (runtime-agnostic) core: no Node-only or browser-only APIs
 *  - Stable event schema & validation (idempotent via opId)
 *  - Minimal persistence port (append/list)
 *  - Server-ordering via per-chat monotonic serverSeq + serverMs
 *  - Simple ACL hooks
 *  - In-memory store for local/dev usage & unit tests
 *
 * This file is framework-free. Route handlers / DBs live in adapters.
 */



import { ChatEvent, StoredEvent, validateWireEventShape,
    normalizeWireEvent,
    Millis,ChatId,UserId,OpId,EVENT_SCHEMA_VERSION
 } from './schema';


import { AclPort, AllowAllAcl } from './acl';

/** Minimal persistence port for the SoR. */
export interface EventStorePort {
    /**
     * Append a new event. If an event with the same opId already exists, it MUST return the existing stored event
     * (idempotent behavior) and MUST NOT create a duplicate.
     */
    append(e: ChatEvent, nowMs: Millis): Promise<StoredEvent>;

    /** List events for a chat strictly after the given serverSeq (cursor). */
    listAfter(chatId: ChatId, afterServerSeq: number, limit: number): Promise<StoredEvent[]>;

    /** Lookup by opId (for idempotency fast-path). */
    getByOpId(opId: OpId): Promise<StoredEvent | undefined>;
}

/** ---------- Guards & Validators ---------- */
const MAX_TEXT = 4000; // hard limit for demo purposes



/** ---------- SoR Facade ---------- */
export interface AppendResult {
    ok: true;
    event: StoredEvent; // authoritative stored event
    /** true if this append hit idempotency (existing opId), false if newly persisted */
    deduped: boolean;
}

export interface ListResult {
    ok: true;
    events: StoredEvent[];
    /** Cursor for the next page (the last event's serverSeq, or unchanged if no events). */
    nextServerSeq: number;
}

export interface SorDeps {
    store: EventStorePort;
    acl: AclPort;
    // dependency providing now() for deterministic testing
    nowMs?: () => Millis;
}
/** ---------- Errors ---------- */
export class SorError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}


export class ValidationError extends SorError {
    constructor(message: string) {
        super("VALIDATION_ERROR", message, 400);
    }
}


export class PermissionError extends SorError {
    constructor(message = "Permission denied") {
        super("PERMISSION_DENIED", message, 403);
    }
}


export class ConflictError extends SorError {
    constructor(message = "Conflict") {
        super("CONFLICT", message, 409);
    }
}
export async function appendEvent(deps: SorDeps, ev: ChatEvent): Promise<AppendResult> {
    const { store, acl } = deps;
    const now = (deps.nowMs ?? (() => Date.now()))();

    validateWireEventShape(ev);

    if (!(await acl.canAppend(ev.authorId, ev.chatId, ev))) {
        throw new PermissionError();
    }

    // Idempotency fast-path
    const existing = await store.getByOpId(ev.opId);
    if (existing) {
        return { ok: true, event: existing, deduped: true };
    }

    // Basic client clock sanity: clamp crazy-future client times (e.g., > 24h ahead)
    const MAX_FUTURE_SKEW = 24 * 60 * 60 * 1000; // 24h
    const safeClientMs = Number.isFinite(ev.clientTime)
        ? Math.min(ev.clientTime, now + MAX_FUTURE_SKEW)
        : now;

    const normalized = normalizeWireEvent({ ...ev, clientTime: safeClientMs, v: ev.v ?? EVENT_SCHEMA_VERSION });

    const stored = await store.append(normalized, now);
    return { ok: true, event: stored, deduped: false };
}

export async function listEvents(
    deps: SorDeps,
    p: { userId: UserId; chatId: ChatId; afterServerSeq?: number; limit?: number }
): Promise<ListResult> {
    const { store, acl } = deps;
    const { userId, chatId } = p;
    const after = Math.max(0, p.afterServerSeq ?? 0);
    const limit = Math.max(1, Math.min(500, p.limit ?? 200));

    if (!(await acl.canRead(userId, chatId))) {
        throw new PermissionError();
    }

    const events = await store.listAfter(chatId, after, limit);
    const nextServerSeq = events.length ? events[events.length - 1].serverSeq : after;

    return { ok: true, events, nextServerSeq };
}

/** ---------- In-Memory Store (dev/test) ---------- */
export class InMemoryStore implements EventStorePort {
    private byChat: Map<ChatId, StoredEvent[]> = new Map();
    private byOpId: Map<OpId, StoredEvent> = new Map();
    private seqByChat: Map<ChatId, number> = new Map();

    async append(e: ChatEvent, nowMs: Millis): Promise<StoredEvent> {
        // idempotency check again (defensive, still expected at facade)
        const dup = this.byOpId.get(e.opId);
        if (dup) return dup;

        const list = this.byChat.get(e.chatId) ?? [];
        const nextSeq = (this.seqByChat.get(e.chatId) ?? 0) + 1;

        const stored: StoredEvent = {
            ...e,
            v: e.v ?? EVENT_SCHEMA_VERSION,
            serverMs: nowMs,
            serverSeq: nextSeq,
        };

        list.push(stored);
        this.byChat.set(e.chatId, list);
        this.byOpId.set(e.opId, stored);
        this.seqByChat.set(e.chatId, nextSeq);

        return stored;
    }

    async listAfter(chatId: ChatId, afterServerSeq: number, limit: number): Promise<StoredEvent[]> {
        const list = this.byChat.get(chatId) ?? [];
        // events have contiguous serverSeq starting at 1
        const startIdx = Math.min(list.length, Math.max(0, afterServerSeq));
        // since serverSeq == index+1, events strictly after N are at index N
        return list.slice(startIdx, startIdx + limit);
    }

    async getByOpId(opId: OpId): Promise<StoredEvent | undefined> {
        return this.byOpId.get(opId);
    }
}


/** ---------- Tiny helper: build a local Sor for tests/dev ---------- */
export function createLocalSor(overrides?: Partial<SorDeps>): SorDeps {
    return {
        store: new InMemoryStore(),
        acl: new AllowAllAcl(),
        nowMs: () => Date.now(),
        ...overrides,
    };
}

/** ---------- Example usage (dev) ---------- */
// The following is intentionally kept as typed examples (not executed).
//
// const sor = createLocalSor();
// const ev: CreateEvent = {
//   opId: crypto.randomUUID(),
//   chatId: "chat-123",
//   authorId: "u-1",
//   clientMs: Date.now(),
//   kind: "create",
//   messageId: "m-1",
//   text: "hello",
// };
// await appendEvent(sor, ev);
// const page = await listEvents(sor, { userId: "u-1", chatId: "chat-123", afterServerSeq: 0, limit: 100 });
// console.log(page.events);
