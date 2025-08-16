import { type Firestore } from 'firebase/firestore';
import type { EventStorePort, SyncEnginePorts } from 'sync-engine';
/** 仅负责事件读写订阅的最小实现 */
export declare function createWebEventStore(db: Firestore): EventStorePort;
/** 提供给应用的组合端口（clock + ids + store） */
export declare function createWebPorts(params: {
    db: Firestore;
    deviceId: string;
    newId: () => string;
}): SyncEnginePorts;
