import { ChatEvent, StoredEvent, Millis, ChatId, UserId, OpId } from './schema';
import { AclPort } from './acl';
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
/** ---------- SoR Facade ---------- */
export interface AppendResult {
    ok: true;
    event: StoredEvent;
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
    nowMs?: () => Millis;
}
/** ---------- Errors ---------- */
export declare class SorError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status?: number);
}
export declare class ValidationError extends SorError {
    constructor(message: string);
}
export declare class PermissionError extends SorError {
    constructor(message?: string);
}
export declare class ConflictError extends SorError {
    constructor(message?: string);
}
export declare function appendEvent(deps: SorDeps, ev: ChatEvent): Promise<AppendResult>;
export declare function listEvents(deps: SorDeps, p: {
    userId: UserId;
    chatId: ChatId;
    afterServerSeq?: number;
    limit?: number;
}): Promise<ListResult>;
/** ---------- In-Memory Store (dev/test) ---------- */
export declare class InMemoryStore implements EventStorePort {
    private byChat;
    private byOpId;
    private seqByChat;
    append(e: ChatEvent, nowMs: Millis): Promise<StoredEvent>;
    listAfter(chatId: ChatId, afterServerSeq: number, limit: number): Promise<StoredEvent[]>;
    getByOpId(opId: OpId): Promise<StoredEvent | undefined>;
}
/** ---------- Tiny helper: build a local Sor for tests/dev ---------- */
export declare function createLocalSor(overrides?: Partial<SorDeps>): SorDeps;
/** ---------- Example usage (dev) ---------- */
