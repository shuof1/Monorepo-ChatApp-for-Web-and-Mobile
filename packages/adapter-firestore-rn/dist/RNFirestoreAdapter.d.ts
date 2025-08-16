import type { EventStorePort, SyncEnginePorts } from 'sync-engine';
/** 最小事件存储实现（在线模式） */
export declare function createRNEventStore(): EventStorePort;
/** 组合端口（clock + ids + store），供 App 注入 core 使用 */
export declare function createRNPorts(params: {
    deviceId: string;
    newId: () => string;
}): SyncEnginePorts;
