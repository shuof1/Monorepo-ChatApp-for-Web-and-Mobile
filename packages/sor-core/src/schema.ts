export type Millis = number; // unix epoch ms

export type ChatId = string;
export type MessageId = string;
export type UserId = string;
export type OpId = string; // client-generated globally-unique id for idempotency

/** ---------- Event Schema ---------- */
export const EVENT_SCHEMA_VERSION = 1 as const;

export type EventType =
    | "create"
    | "edit"
    | "delete"
    | "reaction"
    | "reply"; // Create a new message that replies to an existing message

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
    v?: number; // defaults to EVENT_SCHEMA_VERSION when persisted
}

export interface CreateEvent extends BaseEvent {
    type: "create";
    text: string; // message body
    /** optional reply linkage if the new message is also a reply */
    replyTo?: MessageId;
}


export interface EditEvent extends BaseEvent {
    type: "edit";
    text: string; // renamed newText -> text to align with client shape
}


export interface DeleteEvent extends BaseEvent {
    type: "delete";
}


export interface ReactionEvent extends BaseEvent {
    type: "reaction";
    emoji: string; // e.g., "👍"
    op: "add" | "remove"; // delta-based reaction op
}


export interface ReplyEvent extends BaseEvent {
    type: "reply";
    text: string;
    replyTo: MessageId; // id of the message being replied to
}

export type ChatEvent =
    | CreateEvent
    | EditEvent
    | DeleteEvent
    | ReactionEvent
    | ReplyEvent;

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
export class SchemaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SchemaError";
    }
}


function isFiniteNumber(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n);
}


function isNonEmptyString(s: unknown): s is string {
    return typeof s === "string" && s.trim().length > 0;
}


export function validateWireEventShape(ev: any): asserts ev is ChatEvent {
    if (!ev || typeof ev !== "object") throw new SchemaError("event must be an object");
    const t = ev.type;
    if (t !== "create" && t !== "edit" && t !== "delete" && t !== "reaction" && t !== "reply") {
        throw new SchemaError("type must be one of 'create'|'edit'|'delete'|'reaction'|'reply'");
    }
    if (!isNonEmptyString(ev.chatId)) throw new SchemaError("chatId must be non-empty string");
    if (!isNonEmptyString(ev.messageId)) throw new SchemaError("messageId must be non-empty string");
    if (!isNonEmptyString(ev.authorId)) throw new SchemaError("authorId must be non-empty string");
    if (!isNonEmptyString(ev.clientId)) throw new SchemaError("clientId must be non-empty string");
    if (!isNonEmptyString(ev.opId)) throw new SchemaError("opId must be non-empty string");
    if (!isFiniteNumber(ev.clientTime)) throw new SchemaError("clientTime must be finite number (ms)");


    switch (t as EventType) {
        case "create":
            if (!isNonEmptyString(ev.text)) throw new SchemaError("create.text must be non-empty string");
            if (ev.replyTo != null && !isNonEmptyString(ev.replyTo)) throw new SchemaError("create.replyTo must be non-empty string when present");
            break;
        case "edit":
            if (!isNonEmptyString(ev.text)) throw new SchemaError("edit.text must be non-empty string");
            break;
        case "delete":
            break;
        case "reaction":
            if (!isNonEmptyString(ev.emoji)) throw new SchemaError("reaction.emoji must be non-empty string");
            if (ev.op !== "add" && ev.op !== "remove") throw new SchemaError("reaction.op must be 'add'|'remove'");
            break;
        case "reply":
            if (!isNonEmptyString(ev.text)) throw new SchemaError("reply.text must be non-empty string");
            if (!isNonEmptyString(ev.replyTo)) throw new SchemaError("reply.replyTo must be non-empty string");
            break;
    }
}

/**
* Best-effort normalization that does not apply business policy.
* Examples: trim strings, normalize emoji skin-tone sequences as-is (no transform here),
* ensure `v` is set for forward-compat consumers.
*/
export function normalizeWireEvent<T extends ChatEvent>(ev: T): T {
    const baseTrim = (s: any) => (typeof s === "string" ? s.trim() : s);
    const out: any = { ...ev };
    out.chatId = baseTrim(out.chatId);
    out.messageId = baseTrim(out.messageId);
    out.authorId = baseTrim(out.authorId);
    out.clientId = baseTrim(out.clientId);
    out.opId = baseTrim(out.opId);
    if (typeof out.text === "string") out.text = baseTrim(out.text);
    if (typeof out.emoji === "string") out.emoji = baseTrim(out.emoji);
    if (typeof out.replyTo === "string") out.replyTo = baseTrim(out.replyTo);
    if (typeof out.v !== "number") out.v = EVENT_SCHEMA_VERSION;
    return out as T;
}