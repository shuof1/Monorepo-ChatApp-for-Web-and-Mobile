export type Millis = number;
export type ChatId = string;
export type MessageId = string;
export type UserId = string;
export type OpId = string;
/** ---------- Event Schema ---------- */
export declare const EVENT_SCHEMA_VERSION: 1;
export type EventType = "create" | "edit" | "delete" | "reaction" | "reply";
export interface BaseEvent {
    /** Idempotency key. Clients MUST guarantee global uniqueness (uuid v4 recommended). */
    opId: OpId;
    /** Logical stream key. All events for one conversation share the same chatId. */
    chatId: ChatId;
    /** Client-side author. Used for ACL auditing and downstream CRDTs. */
    authorId: UserId;
    /** Device/Client identifier (used by outbox, dedupe per-device, analytics). */
    clientId: string;
    /** Client wall-clock time in ms. May be skewed; serverMs provides authoritative ordering. */
    clientTime: Millis;
    /** Schema discriminator */
    type: EventType;
    /** Message id target. For create/reply, this is the NEW message id. For edit/delete/reaction, it's the EXISTING target message id. */
    messageId: MessageId;
    /** For forward-compat / migrations */
    v?: number;
}
export interface CreateEvent extends BaseEvent {
    type: "create";
    text: string;
    /** optional reply linkage if the new message is also a reply */
    replyTo?: MessageId;
}
export interface EditEvent extends BaseEvent {
    type: "edit";
    text: string;
}
export interface DeleteEvent extends BaseEvent {
    type: "delete";
}
export interface ReactionEvent extends BaseEvent {
    type: "reaction";
    emoji: string;
    op: "add" | "remove";
}
export interface ReplyEvent extends BaseEvent {
    type: "reply";
    text: string;
    replyTo: MessageId;
}
export type ChatEvent = CreateEvent | EditEvent | DeleteEvent | ReactionEvent | ReplyEvent;
/** Event as stored by the SoR with server ordering. */
export type StoredEvent = ChatEvent & {
    /** Authoritative server-assigned time in ms. */
    serverMs: Millis;
    /** Monotonic, per-chat ordering sequence. Starts at 1 and increases by 1 for each append. */
    serverSeq: number;
    /** For convenience when piping back to clients expecting serverTimeMs */
    serverTimeMs?: Millis;
    /** Schema version pinned at persist time. */
    v: number;
};
/** ---------- Narrow runtime validators (no business rules) ---------- */
export declare class SchemaError extends Error {
    constructor(message: string);
}
export declare function validateWireEventShape(ev: any): asserts ev is ChatEvent;
/**
* Best-effort normalization that does not apply business policy.
* Examples: trim strings, normalize emoji skin-tone sequences as-is (no transform here),
* ensure `v` is set for forward-compat consumers.
*/
export declare function normalizeWireEvent<T extends ChatEvent>(ev: T): T;
