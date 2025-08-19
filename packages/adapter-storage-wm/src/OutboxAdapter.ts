// packages/adapter-storage-wm/src/OutboxAdapter.ts
import { Q } from '@nozbe/watermelondb'
import { getDB } from './wm'
import { OutboxItem } from './models'
import { TABLES } from './schema'

export type OutboxOp = 'create' | 'edit' | 'delete' | 'ack' | string

export interface EnqueueInput {
    op: OutboxOp
    chatId?: string | null
    targetId?: string | null
    payload?: any | null
    lamport?: number | null
    dedupeKey?: string | null
    queuedAt?: number // 默认 Date.now()
}

/** 最小 Outbox 适配器 */
export class OutboxAdapter {
    /** 入队；支持通过 dedupeKey 幂等去重（若找到同 key 项则直接返回该项） */
    async enqueue(input: EnqueueInput): Promise<OutboxItem> {
        const db = getDB()
        const now = input.queuedAt ?? Date.now()

        return await db.write(async () => {
            // 若传了 dedupeKey，尝试查找已存在项
            if (input.dedupeKey) {
                const existing = await db
                    .get<OutboxItem>(TABLES.outbox)
                    .query(Q.where('dedupe_key', input.dedupeKey))
                    .fetch()

                if (existing.length > 0) {
                    // 简化：不更新已存在项，直接返回
                    return existing[0]
                }
            }

            // 创建新队列项
            const created = await db.get<OutboxItem>(TABLES.outbox).create((rec) => {
                // 基础字段
                // @ts-ignore 直接赋值以保持最小实现

                rec.op = input.op
                rec.chatId = input.chatId ?? null
                rec.targetId = input.targetId ?? null
                rec.dedupeKey = input.dedupeKey ?? null
                rec.lamport = input.lamport ?? null
                rec.queuedAt = now
                rec.attempt = 0
                rec.lastError = null
                rec.payload = input.payload ?? null

            })
            return created
        })
    }

    /**
     * 查看队首 n 条（不加锁，不修改记录）
     * @param n  默认 10
     * @param maxAttempt 仅返回 attempt 未超过该阈值的记录（默认 5）
     * @param chatId 可选地限定 chat
     */
    async peek(n = 10, maxAttempt = 5, chatId?: string): Promise<OutboxItem[]> {
        const db = getDB()
        return await db.read(async () => {
            const collection = db.get<OutboxItem>(TABLES.outbox)
            const clauses: any[] = [Q.sortBy('queued_at', Q.asc)]
            if (chatId) clauses.push(Q.where('chat_id', chatId))
            // WatermelonDB 不支持直接对 null 做比较，attempt 为空时视为 0
            const rows = await collection.query(...clauses).fetch()
            return rows
                .filter((r) => (r.attempt ?? 0) <= maxAttempt)
                .slice(0, n)
        })
    }

    /** 将队列项标记完成并物理删除 */
    async markDone(id: string): Promise<void> {
        const db = getDB()
        await db.write(async () => {
            const item = await db.get<OutboxItem>(TABLES.outbox).find(id)
            await item.markAsDeleted()         // 软删（同步标记）
            await item.destroyPermanently()    // 物理删除
        })
    }

    /** 标记失败：记录错误并 attempt+1 */
    async markFailed(id: string, error: unknown): Promise<void> {
        const db = getDB()
        await db.write(async () => {
            const item = await db.get<OutboxItem>(TABLES.outbox).find(id)
            const nextAttempt = (item.attempt ?? 0) + 1
            await item.update((rec) => {
                rec.attempt = nextAttempt
                rec.lastError = typeof error === 'string' ? error : JSON.stringify(error ?? '')
            })
        })
    }

    /** 仅增加 attempt（例如上层做了统一错误处理） */
    async incAttempt(id: string): Promise<void> {
        const db = getDB()
        await db.write(async () => {
            const item = await db.get<OutboxItem>(TABLES.outbox).find(id)
            await item.update((rec) => {
                rec.attempt = (rec.attempt ?? 0) + 1
            })
        })
    }

    /** 根据 dedupeKey 查找 */
    async findByDedupeKey(key: string): Promise<OutboxItem | null> {
        const db = getDB()
        return await db.read(async () => {
            const rows = await db
                .get<OutboxItem>(TABLES.outbox)
                .query(Q.where('dedupe_key', key))
                .fetch()
            return rows[0] ?? null
        })
    }

    /** 清空整个 outbox（开发/调试用途） */
    async clearAll(): Promise<void> {
        const db = getDB()
        await db.write(async () => {
            const rows = await db.get<OutboxItem>(TABLES.outbox).query().fetch()
            for (const r of rows) {
                await r.markAsDeleted()
                await r.destroyPermanently()
            }
        })
    }
}
