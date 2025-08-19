import { Database } from "@nozbe/watermelondb";
import { schema } from "./schema";
import { modelClasses } from "./models";

import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
// 不要用 `import LokiJSAdapter from ...` 直接 new
// import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'
import LokiJSAdapterRaw from '@nozbe/watermelondb/adapters/lokijs';


// 兜底（兼容某些打包器把 default 又包了一层）
const LokiJSAdapter: any =
  (LokiJSAdapterRaw as any)?.default ?? (LokiJSAdapterRaw as any);

// 兼容 ESM/CJS：拿到真正的构造器
// const LokiJSAdapter= LokiAdapterMod.LokiJSAdapter;
console.log('[wm-web] LokiJSAdapter typeof =', typeof LokiJSAdapter);

type WMEnv = 'web' | 'native' | 'unknown'

let _db: Database | null = null

function detectEnv(): WMEnv {
  // React Native
  if (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') {
    return 'native'
  }
  // 浏览器（含 Next.js 客户端）
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'web'
  }
  return 'unknown' // 例如 SSR/Node
}

function createAdapter(env: WMEnv) {
  if (typeof LokiJSAdapter !== 'function') {
    throw new Error(
      '[wm-web] Failed to load LokiJSAdapter: got ' 
    );
  }
  if (env === 'native') {
    // RN: 默认使用 SQLite（Expo 或 react-native-sqlite-storage 均可）
    return new SQLiteAdapter({
      schema,
      // dbName 可自定义；Android 多进程或多实例时可带前缀
      dbName: 'chat_local.db',
      // jsi: true, // 若项目已启用 WatermelonDB JSI，可放开
      // migrations, // 未来升级 schema 时再添加
    })
  }

  if (env === 'web') {
    // Web: 使用 LokiJS（IndexedDB 持久化）
    return new LokiJSAdapter({
      dbName: 'chat_local',
      schema,
      useWebWorker: false, // 最小实现：禁用 worker 以减少复杂度
      useIncrementalIndexedDB: true, // 新版可开启以提升性能（可选）
      // onIndexedDBVersionChange: () => window.location.reload(), // 可选：版本变化时刷新
    })
  }

  // 兜底：在未知环境（如 SSR）避免初始化
  throw new Error('[adapter-storage-wm] Database cannot be initialized in this environment (SSR/Node).')
}

/**
 * 获取 WatermelonDB 单例。
 * - 在 SSR 环境调用会抛错；请在客户端生命周期（如 useEffect）里调用。
 */
export function getDB(): Database {
  if (_db) return _db

  const env = detectEnv()
  if (env === 'unknown') {
    throw new Error('[adapter-storage-wm] getDB() called in non-client environment.')
  }

  const adapter = createAdapter(env)
  _db = new Database({
    adapter,
    modelClasses,
  })

  return _db
}

/** （可选）释放数据库资源；在 Web 里通常不必显式关闭 */
export async function resetDatabase() {
  if (!_db) return
  // 更安全的重置：清空本地库（开发/调试用）
  await _db.write(async () => {
    // @ts-ignore - WatermelonDB 暴露在 adapter 上的方法
    await (_db?.adapter?.unsafeResetDatabase?.() ?? Promise.resolve())
  })
}

/** 快捷环境标识（可用于上层做条件逻辑） */
export const isWeb = () => detectEnv() === 'web'
export const isNative = () => detectEnv() === 'native'
