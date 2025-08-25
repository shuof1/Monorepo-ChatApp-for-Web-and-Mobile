import { Q } from '@nozbe/watermelondb'
import { getDB } from './wm'
import { Message, Kv } from './models'
import { TABLES } from './schema'
import type { MessagePayload, MessageSnapshot } from './models'
import type { ChatMsg } from 'sync-engine'    // 仅类型，用于便捷 API

const KV_LAST_CLIENT_TIME = (chatId: string) => `cursor:clientTime:${chatId}`

// 将 ChatMsg（运行时）映射到 Message 快照（持久化）
function snapshotFromChatMsg(m: ChatMsg): Omit<MessageSnapshot, 'id'> {
  const sort = (m.updatedAt ?? m.createdAt).getTime()
  const payload: MessagePayload = {
    reactions: m.reactions,
    // 如你需要快照 reply 信息，也可一并保存：
    // replyTo: m.replyTo,
    // replies: m.replies,
  }
  return {
    remoteId: m.id,                 // 以 messageId 作为远端 id
    chatId: '',                     // 由调用方填充（因 ChatMsg 没有 chatId 字段）
    authorId: m.authorId,
    text: m.text ?? null,
    sortKey: sort,
    createdAt: m.createdAt.getTime(),
    editedAt: m.updatedAt?.getTime() ?? null,
    deletedAt: m.deleted ? sort : null,
    version: null,
    lamport: null,
    status: null,
    payload: payload,
    localOnly: null,
  }
}

// 将本地快照还原为 ChatMsg（给 UI 上屏）
function chatMsgFromSnapshot(s: MessageSnapshot): ChatMsg {
  const p = (s.payload ?? {}) as MessagePayload
  return {
    id: s.remoteId ?? s.id, // 没有 remoteId 时退回本地 id
    text: s.text ?? '',
    authorId: s.authorId,
    createdAt: new Date(s.createdAt),
    updatedAt: s.editedAt ? new Date(s.editedAt) : undefined,
    deleted: !!s.deletedAt,
    // 如果你保存了 replyTo/replies，可以还原：
    // replyTo: p.replyTo,
    // replies: p.replies,
    reactions: p.reactions,
  }
}

export class LocalStorageAdapter {
  /** 插入或更新一条消息快照（按 remoteId+chatId 幂等） */
  async upsertMessage(msg: Omit<MessageSnapshot, 'id'>): Promise<Message> {
    const db = getDB()

    return await db.write(async () => {
      // 先尝试命中：有 remoteId 的走精确匹配
      let existing: Message | undefined
      if (msg.remoteId) {
        const candidates = await db
          .get<Message>(TABLES.messages)
          .query(
            Q.where('remote_id', msg.remoteId),
            Q.where('chat_id', msg.chatId),
            Q.take(1),
          )
          .fetch()
        existing = candidates[0]
      }

      if (existing) {
        await existing.update(rec => {
          // 精确字段更新，避免 _raw 覆盖误伤
          rec.remoteId   = msg.remoteId ?? null
          rec.chatId     = msg.chatId
          rec.authorId   = msg.authorId
          rec.text       = msg.text ?? null
          rec.sortKey    = msg.sortKey
          rec.createdAt  = msg.createdAt
          rec.editedAt   = msg.editedAt ?? null
          rec.deletedAt  = msg.deletedAt ?? null
          rec.version    = msg.version ?? null
          rec.lamport    = msg.lamport ?? null
          rec.status     = msg.status ?? null
          rec.payload    = (msg as any).payload ?? null
          rec.localOnly  = msg.localOnly ?? null
        })
        return existing
      }

      // 不存在则创建
      return await db.get<Message>(TABLES.messages).create(rec => {
        rec.remoteId   = msg.remoteId ?? null
        rec.chatId     = msg.chatId
        rec.authorId   = msg.authorId
        rec.text       = msg.text ?? null
        rec.sortKey    = msg.sortKey
        rec.createdAt  = msg.createdAt
        rec.editedAt   = msg.editedAt ?? null
        rec.deletedAt  = msg.deletedAt ?? null
        rec.version    = msg.version ?? null
        rec.lamport    = msg.lamport ?? null
        rec.status     = msg.status ?? null
        rec.payload    = (msg as any).payload ?? null
        rec.localOnly  = msg.localOnly ?? null
      })
    })
  }

  /** 按 chatId 拉取最近 N 条消息（倒序） */
  async getMessages(chatId: string, limit = 50): Promise<Message[]> {
    const db = getDB()
    return await db.read(async () => {
      return await db
        .get<Message>(TABLES.messages)
        .query(
          Q.where('chat_id', chatId),
          Q.sortBy('sort_key', Q.desc),
          Q.take(limit),
        )
        .fetch()
    })
  }

  // —— 便捷封装：与 ChatMsg 互转 —— //

  /** 用 ChatMsg（来自 LoroDoc）落地/刷新快照。需要调用方传 chatId。 */
  async upsertFromChatMsg(chatId: string, m: ChatMsg): Promise<Message> {
    const snap = snapshotFromChatMsg(m)
    snap.chatId = chatId
    snap.remoteId = m.id
    return this.upsertMessage(snap)
  }

  /** 冷启动兜底：将本地快照按 ChatMsg[] 形式返回（供 UI 直接上屏） */
  async getMessagesAsChatMsg(chatId: string, limit = 50): Promise<ChatMsg[]> {
    const rows = await this.getMessages(chatId, limit)
    return rows.map(r => chatMsgFromSnapshot({
      id: r.id, // 本地 id
      remoteId: r.remoteId,
      chatId: r.chatId,
      authorId: r.authorId,
      text: r.text,
      sortKey: r.sortKey,
      createdAt: r.createdAt,
      editedAt: r.editedAt ?? undefined,
      deletedAt: r.deletedAt ?? undefined,
      version: r.version ?? undefined,
      lamport: r.lamport ?? undefined,
      status: r.status ?? undefined,
      payload: r.payload as MessagePayload | null,
      localOnly: r.localOnly ?? undefined,
    }))
  }

  // —— KV：保存增量游标（clientTime），给 EventStore.subscribe 使用 —— //

  async setLastClientTime(chatId: string, ms: number): Promise<void> {
    await this.setKv(KV_LAST_CLIENT_TIME(chatId), ms)
  }

  async getLastClientTime(chatId: string): Promise<number | null> {
    return await this.getKv<number>(KV_LAST_CLIENT_TIME(chatId))
  }

  /** 设置 KV（游标/状态） */
  async setKv(key: string, value: any): Promise<void> {
    const db = getDB()
    await db.write(async () => {
      const rs = await db.get<Kv>(TABLES.kv).query(Q.where('k', key), Q.take(1)).fetch()
      const now = Date.now()
      const found = rs[0]
      if (found) {
        await found.update(rec => {
          rec.k = key
          rec.v = value
          rec.updatedAt = now
        })
      } else {
        await db.get<Kv>(TABLES.kv).create(rec => {
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
      const rs = await db.get<Kv>(TABLES.kv).query(Q.where('k', key), Q.take(1)).fetch()
      const found = rs[0]
      return found ? (found.v as T) : null
    })
  }
}
