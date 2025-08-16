import type { ChatEvent, Millis } from './types';
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
    subscribe(chatId: string, onEvent: (ev: ChatEvent) => void): Unsubscribe;
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
}
