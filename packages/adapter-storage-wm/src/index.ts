// packages/adapter-storage-wm/src/index.ts
// 在文件顶部使用 import 导入需要的模块
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { OutboxAdapter, type Runner, type OutboxDispatch, type RunnerOptions } from './OutboxAdapter';
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


declare global {
  // eslint-disable-next-line no-var
  var __outbox_adapter_singleton__: OutboxAdapter | undefined;
  // eslint-disable-next-line no-var
  var __outbox_runner_singleton__: Runner | undefined;
}

export function getOutboxAdapterSingleton(): OutboxAdapter {
  if (!globalThis.__outbox_adapter_singleton__) {
    globalThis.__outbox_adapter_singleton__ = new OutboxAdapter();
  }
  return globalThis.__outbox_adapter_singleton__;
}

/** 第一次调用时必须提供 dispatch；后续再调将复用已建 runner */
export function getOutBoxRunnerSingleton(
  dispatch?: OutboxDispatch,
  options?: RunnerOptions
): Runner {
  if (!globalThis.__outbox_runner_singleton__) {
    if (!dispatch) {
      throw new Error("[getOutBoxRunnerSingleton] first call needs a dispatch function");
    }
    const adapter = getOutboxAdapterSingleton();
    globalThis.__outbox_runner_singleton__ = adapter.createRunner(dispatch, options);
  }
  return globalThis.__outbox_runner_singleton__;
}

