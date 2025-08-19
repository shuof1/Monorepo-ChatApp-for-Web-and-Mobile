import type { ChatEvent, ChatMsg, Millis } from './types';
/** 取消订阅函数 */
export type Unsubscribe = () => void;
/**
 * 事件存储端口（最小化）
 * - append：向后端追加一条事件（create/edit/delete）
 * - list：初始化加载某个 chat 的事件（可选 limit/since）
 * - subscribe：在线模式下的实时订阅，回调增量事件
 *
 * 约定：
 * 1) 适配器必须把任何平台时间戳转换为毫秒 number，写入 ChatEvent.serverTimeMs（可缺省）。
 * 2) 不保证到达顺序，core 用 compareClock 处理并发与乱序。
 */
export interface EventStorePort {
    append(ev: ChatEvent): Promise<void>;
    list(chatId: string, opts?: {
        sinceMs?: Millis;
        limit?: number;
    }): Promise<ChatEvent[]>;
    subscribe(chatId: string, onEvent: (ev: ChatEvent) => void, opts?: {
        sinceMs?: Millis;
    }): Unsubscribe;
}
/** 时钟端口：提供本地毫秒时间，用于填充 clientTime */
export interface ClockPort {
    now(): Millis;
}
/** ID 端口：提供事件 id（opId）与客户端/设备 id */
export interface IdPort {
    newId(): string;
    deviceId: string;
}
/**
 * SyncEngine 组合端口
 * 适配器在各平台实现这些接口并注入到 core。
 */
export interface SyncEnginePorts {
    store: EventStorePort;
    clock: ClockPort;
    ids: IdPort;
    local?: LocalStoragePort;
    outbox?: OutboxPort;
}
/** 新加功能：离线 */
export type LocalStoragePort = {
    loadEvents(chatId: string, sinceMs?: Millis): Promise<ChatEvent[]>;
    appendEvents(chatId: string, events: ChatEvent[]): Promise<void>;
    saveSnapshot(chatId: string, messages: Map<string, ChatMsg>): Promise<void>;
    loadSnapshot(chatId: string): Promise<Map<string, ChatMsg> | null>;
    clearChat(chatId: string): Promise<void>;
};
export type OutboxItem = ({
    kind: 'create';
} & {
    chatId: string;
    messageId: string;
    text: string;
    authorId: string;
    clientTime: number;
    opId: string;
    clientId: string;
}) | ({
    kind: 'edit';
} & {
    chatId: string;
    messageId: string;
    text: string;
    authorId: string;
    clientTime: number;
    opId: string;
    clientId: string;
}) | ({
    kind: 'delete';
} & {
    chatId: string;
    messageId: string;
    authorId: string;
    clientTime: number;
    opId: string;
    clientId: string;
});
export type OutboxPort = {
    enqueue(items: OutboxItem[]): Promise<void>;
    peekBatch(limit: number): Promise<OutboxItem[]>;
    markDone(opIds: string[]): Promise<void>;
    size(): Promise<number>;
    clear(): Promise<void>;
};
