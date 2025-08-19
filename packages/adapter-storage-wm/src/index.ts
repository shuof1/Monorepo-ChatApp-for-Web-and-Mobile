// packages/adapter-storage-wm/src/index.ts
// 在文件顶部使用 import 导入需要的模块
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { OutboxAdapter } from './OutboxAdapter';
// 基础导出：schema / models / db 工具
export { schema, TABLES, SCHEMA_VERSION } from './schema'
export { Message, OutboxItem, Kv, modelClasses } from './models'
export { getDB, resetDatabase, isWeb, isNative } from './wm'

// 实用适配器：本地存取 & Outbox
export { LocalStorageAdapter } from './LocalStorageAdapter'
export { OutboxAdapter } from './OutboxAdapter'

// （可选）简单工厂，便于上层按需创建
export const createLocalStorage = () => new LocalStorageAdapter();
export const createOutbox = () => new OutboxAdapter();