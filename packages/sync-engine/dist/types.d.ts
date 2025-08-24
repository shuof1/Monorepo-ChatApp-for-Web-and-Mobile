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
};
export type ChatEvent = (BaseEvent & {
    type: 'create';
    text: string;
    replyTo?: string;
}) | (BaseEvent & {
    type: 'edit';
    text: string;
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
export {};
