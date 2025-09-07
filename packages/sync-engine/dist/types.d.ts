import { LoroText } from 'loro-crdt';
export type Millis = number;
export type Clock = {
    t: Millis;
    tie: string;
};
export declare const compareClock: (a: Clock, b: Clock) => number;
type BaseEvent = {
    chatId: string;
    messageId: string;
    authorId: string;
    clientId: string;
    opId: string;
    clientTime: Millis;
    serverTimeMs?: Millis;
    payload?: any;   
};
export type ChatEvent = (BaseEvent & {
    type: 'create';
    text?: string;
    replyTo?: string;
}) | (BaseEvent & {
    type: 'edit';
    text? : string;
}) | (BaseEvent & {
    type: 'delete';
}) | (BaseEvent & {
    type: 'reaction';
    emoji: string;
    op: 'add' | 'remove';
}) | (BaseEvent & {
    type: 'reply';
    text: string;
    replyTo: string;
});
export type ChatMsg = {
    id: string;
    text: string;
    authorId: string;
    createdAt: Date;
    updatedAt?: Date;
    deleted?: boolean;
    reactions?: Record<string, string[]>;
    replyTo?: string;
    replies?: string[];
};
export type InternalLoroChatMsg = {
    text: LoroText;
    authorId: string;
    createdAt: number;
    updatedAt?: number;
    deleted?: boolean;
    replyTo?: string;
    reactions: Map<string, string[]>;
    replies: string[];
};
export type ChatState = {
    byId: Record<string, ChatMsg>;
};
export type ApplyEvent = (state: ChatState, ev: ChatEvent) => ChatState;
/** ===== E2EE 相关 ===== **/
export type ClearHeader = {
    v: 1;
    chatId: string;
    type: 'create' | 'edit' | 'delete' | 'reaction' | 'reply' | 'e2ee_invite' | 'e2ee_ack';
    messageId: string;
    authorId: string;
    clientId: string;
    deviceId?: string;
    clientTime: number;
    opId: string;
    target?: {
        userId: string;
        deviceId?: string;
        clientId?: string;
    };
    e2ee?: {
        mode: 'device-bound';
        receiverDeviceId?: string;
        receiverClientId?: string;
        ephPubKey?: string;
    };
    sig?: string;
};
export type SecretBody = {
    text?: string;
    payload?: any;
    reaction?: {
        emoji: string;
        op: 'add' | 'remove';
    };
    replyTo?: string;
};
export type EncryptedEvent = {
    header: ClearHeader;
    ciphertext: string;
    nonce: string;
};
export type PlainEvent = ChatEvent;
export type E2EEInvite = {
    header: Omit<ClearHeader, 'type'> & {
        type: 'e2ee_invite';
        v: 1;
    };
    body: {
        inviterUserId: string;
        inviterDeviceId?: string;
        inviterClientId?: string;
        inviterDevicePubX25519: string;
        inviterSignPubEd25519?: string;
        suggestedChatId: string;
        note?: string;
    };
    sig?: string;
};
export type E2EEAck = {
    header: Omit<ClearHeader, 'type'> & {
        type: 'e2ee_ack';
        v: 1;
    };
    body: {
        accepterUserId: string;
        accepterDeviceId?: string;
        accepterClientId?: string;
        accepterDevicePubX25519: string;
        accepterSignPubEd25519?: string;
        acceptedChatId: string;
    };
    sig?: string;
};
export type WireEvent = PlainEvent | EncryptedEvent | E2EEInvite | E2EEAck;
export declare const isEncryptedEvent: (w: WireEvent) => w is EncryptedEvent;
export declare const isE2EEInvite: (w: WireEvent) => w is E2EEInvite;
export declare const isE2EEAck: (w: WireEvent) => w is E2EEAck;
export {};
