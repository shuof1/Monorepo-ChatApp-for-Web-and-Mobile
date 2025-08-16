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
}) | (BaseEvent & {
    type: 'edit';
    text: string;
}) | (BaseEvent & {
    type: 'delete';
});
export type ChatMsg = {
    id: string;
    text: string;
    authorId: string;
    createdAt: Date;
    updatedAt?: Date;
    deleted?: boolean;
};
export type ChatState = {
    byId: Record<string, ChatMsg>;
};
export type ApplyEvent = (state: ChatState, ev: ChatEvent) => ChatState;
export {};
