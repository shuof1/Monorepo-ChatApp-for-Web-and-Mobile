import { Q } from '@nozbe/watermelondb'
import { getDB } from './wm'
import { OutboxItem } from './models'
import { TABLES } from './schema'
import type { ChatEvent } from 'sync-engine' // ✅ type-only 导入

export type OutboxDispatch = (item: OutboxItem) => Promise<void>;
export type Runner = {
  start(): void;
  stop(): void;
  readonly started: boolean;
};

export type RunnerOptions = {
  batchSize?: number;    // 每次处理多少条
  maxAttempt?: number;   // 超过则不再处理
  idleMs?: number;       // 队列为空时的休眠
  jitterMs?: number;     // 抖动，避免“齐步走”
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const rand = (n: number) => Math.floor(Math.random() * n);

// 允许 'ack' 这类非 ChatEvent 的内部操作
export type OutboxOp = ChatEvent['type'] | 'ack' | (string & {})

export interface EnqueueInput {
  op: OutboxOp
  chatId?: string | null
  targetId?: string | null
  payload?: ChatEvent | null     // ✅ 强类型（ack 可为 null）
  lamport?: number | null
  dedupeKey?: string | null
  queuedAt?: number
}

// -------- 运行时守卫 / 规范化 --------
function sanitizeEvent(ev: ChatEvent | null | undefined): ChatEvent | null {
  if (!ev) return null
  switch (ev.type) {
    case 'reaction': {
      const emoji = (ev.emoji ?? '').trim()
      if (!emoji) return null
      return { ...ev, emoji }
    }
    case 'reply': {
      const replyTo = (ev.replyTo ?? '').trim()
      if (!replyTo) return null
      return { ...ev, replyTo }
    }
    case 'create':
    case 'edit':
    case 'delete':
      return ev
    default:
      return null
  }
}

/** 最小 Outbox 适配器（强类型 + 运行时校验） */
export class OutboxAdapter {
  createRunner(
    dispatch: OutboxDispatch,
    opts: RunnerOptions = {}
  ): Runner {
    const adapter = this;

    const batchSize = opts.batchSize ?? 10;
    const maxAttempt = opts.maxAttempt ?? 5;
    const idleMs = opts.idleMs ?? 1200;
    const jitterMs = opts.jitterMs ?? 300;

    let _started = false;
    let _stopping = false;

    async function loop() {
      while (!_stopping) {
        const items = await adapter.peek(batchSize, maxAttempt);
        if (items.length === 0) {
          await sleep(idleMs + rand(jitterMs));
          continue;
        }

        // 串行处理，最稳妥；需要提速时可做小并发（注意幂等）
        for (const it of items) {
          try {
            await dispatch(it);          // 交给上层真正“发送”
            await adapter.markDone(it.id);
          } catch (e) {
            await adapter.markFailed(it.id, e);
          }
          if (_stopping) break;
        }
        // 主动让出事件循环，避免长时间占用
        await Promise.resolve();
      }
    }

    return {
      start() {
        if (_started) return;
        _started = true;
        _stopping = false;
        // fire and forget
        loop().catch(err => console.error("[OutboxRunner] loop error:", err));
      },
      stop() {
        _stopping = true;
        _started = false;
      },
      get started() {
        return _started && !_stopping;
      }
    };
  }
  /** 入队；支持通过 dedupeKey 幂等去重（若找到同 key 项则直接返回该项） */
  async enqueue(input: EnqueueInput): Promise<OutboxItem> {
    const db = getDB()
    const now = input.queuedAt ?? Date.now()

    // ✅ 仅当是 ChatEvent 类操作时才校验 payload；ack 等允许为空
    const isChatEventOp =
      input.op === 'create' ||
      input.op === 'edit' ||
      input.op === 'delete' ||
      input.op === 'reaction' ||
      input.op === 'reply'

    const ev = isChatEventOp ? sanitizeEvent(input.payload as ChatEvent) : null
    if (isChatEventOp && !ev) {
      throw new Error('[Outbox] invalid ChatEvent payload for op=' + input.op)
    }

    return await db.write(async () => {
      if (input.dedupeKey) {
        const existing = await db
          .get<OutboxItem>(TABLES.outbox)
          .query(Q.where('dedupe_key', input.dedupeKey), Q.take(1))
          .fetch()

        if (existing.length > 0) {
          // 保持最小语义：不更新既有项
          return existing[0]
        }
      }

      const created = await db.get<OutboxItem>(TABLES.outbox).create(rec => {
        // @ts-ignore 逐字段赋值（与 models.ts 对齐）
        rec.op = input.op
        rec.chatId = input.chatId ?? null
        rec.targetId = input.targetId ?? null
        rec.dedupeKey = input.dedupeKey ?? null
        rec.lamport = input.lamport ?? null
        rec.queuedAt = now
        rec.attempt = 0
        rec.lastError = null
        // ✅ 存入已校验过的事件（或 null）
        rec.payload = (ev ?? input.payload ?? null) as any
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

      const rows = await collection.query(...clauses).fetch()
      return rows
        .filter(r => (r.attempt ?? 0) <= maxAttempt) // attempt 为空视为 0
        .slice(0, n)
    })
  }

  /** 将队列项标记完成并物理删除 */
  async markDone(id: string): Promise<void> {
    const db = getDB()
    await db.write(async () => {
      const col = db.get(TABLES.outbox);
      try {
        const item = await col.find(id);
        await item.markAsDeleted();           // 或 destroyPermanently()
      } catch {
        // 已被处理掉，忽略
        return;
      }
    });
  }

  /** 标记失败：记录错误并 attempt+1 */
  async markFailed(id: string, error: unknown): Promise<void> {
    const db = getDB()
    await db.write(async () => {
      const col = db.get<OutboxItem>(TABLES.outbox)
      let item;
      try {
        item = await col.find(id);
      } catch {
        console.warn(`[Outbox] markFailed: item not found, id=${id}`);
        return;
      }
      await item.update(rec => {
        rec.attempt = (rec.attempt ?? 0) + 1;
      });
    })
  }

  /** 仅增加 attempt（例如上层做了统一错误处理） */
  async incAttempt(id: string): Promise<void> {
    const db = getDB()
    await db.write(async () => {
      const item = await db.get<OutboxItem>(TABLES.outbox).find(id)
      await item.update(rec => {
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
        .query(Q.where('dedupe_key', key), Q.take(1))
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
