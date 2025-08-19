// packages/adapter-storage-wm/src/LocalStorageAdapter.ts
import { getDB } from './wm'
import { Message, Kv } from './models'
import { TABLES } from './schema'

export class LocalStorageAdapter {
  /** 插入或更新一条消息 */
  async upsertMessage(msg: {
    remoteId?: string | null
    chatId: string
    authorId: string
    text?: string | null
    sortKey: number
    createdAt: number
    editedAt?: number | null
    deletedAt?: number | null
    version?: number | null
    lamport?: number | null
    status?: string | null
    payload?: any | null
    localOnly?: boolean | null
  }): Promise<Message> {
    const db = getDB()
    return await db.write(async () => {
      // 先查是否已存在（根据 remoteId + chatId）
      if (msg.remoteId) {
        const existing = await db
          .get<Message>(TABLES.messages)
          .query()
          .fetch()

        const found = existing.find(
          (m) => m.remoteId === msg.remoteId && m.chatId === msg.chatId
        )
        if (found) {
          await found.update((rec) => {
            rec._raw = { ...rec._raw, ...msg } // 简化：直接覆盖 _raw
          })
          return found
        }
      }

      // 不存在则创建
      return await db.get<Message>(TABLES.messages).create((rec) => {
        rec._raw = { ...rec._raw, ...msg }
      })
    })
  }

  /** 按 chatId 拉取最近 N 条消息（倒序） */
  async getMessages(chatId: string, limit = 50): Promise<Message[]> {
    const db = getDB()
    return await db.read(async () => {
      const all = await db.get<Message>(TABLES.messages).query().fetch()
      return all
        .filter((m) => m.chatId === chatId)
        .sort((a, b) => b.sortKey - a.sortKey)
        .slice(0, limit)
    })
  }

  /** 设置 KV（游标/状态） */
  async setKv(key: string, value: any): Promise<void> {
    const db = getDB()
    await db.write(async () => {
      const all = await db.get<Kv>(TABLES.kv).query().fetch()
      const found = all.find((kv) => kv.k === key)
      const now = Date.now()
      if (found) {
        await found.update((rec) => {
          rec.k = key
          rec.v = value
          rec.updatedAt = now
        })
      } else {
        await db.get<Kv>(TABLES.kv).create((rec) => {
          rec.k = key
          rec.v = value
          rec.updatedAt = now
        })
      }
    })
  }

  /** 读取 KV */
  async getKv<T = any>(key: string): Promise<T | null> {
    const db = getDB()
    return await db.read(async () => {
      const all = await db.get<Kv>(TABLES.kv).query().fetch()
      const found = all.find((kv) => kv.k === key)
      return found ? (found.v as T) : null
    })
  }
}
