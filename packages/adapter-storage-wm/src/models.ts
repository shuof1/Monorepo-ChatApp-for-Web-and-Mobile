
import { Model } from "@nozbe/watermelondb";
import { field,json, readonly, text} from "@nozbe/watermelondb/decorators";
import type { Associations } from "@nozbe/watermelondb/Model";
import { TABLES } from "./schema";


// ---- JSON sanitizer ----
// WatermelonDB 的 @json 需要一个 sanitizer，返回“可序列化的干净对象”
const identityJson = (raw: any) => {
  // 允许 undefined/null，统一返回对象或基础类型
  if (raw == null) return null
  try {
    // 若已经是对象，浅克隆一下；若是基础类型直接返回
    if (typeof raw === 'object') return JSON.parse(JSON.stringify(raw))
    return raw
  } catch {
    // 回退兜底
    return null
  }
}

/** 本地消息快照（渲染/查询友好） */
export class Message extends Model {
  static table = TABLES.messages
  static associations: Associations = {}

  // 远端 id（离线新建可能为空）
  @field('remote_id') remoteId!: string | null

  // 会话与作者
  @field('chat_id') chatId!: string
  @field('author_id') authorId!: string

  // 纯文本（更复杂内容放 payload）
  @field('text') text!: string | null

  // 排序与时间
  @field('sort_key') sortKey!: number
  @field('created_at') createdAt!: number
  @field('edited_at') editedAt!: number | null
  @field('deleted_at') deletedAt!: number | null

  // 逻辑时钟/版本（预留）
  @field('version') version!: number | null
  @field('lamport') lamport!: number | null

  // 发送状态（pending/sent/failed…）
  @field('status') status!: string | null

  // 扩展信息（以字符串存储；@json 提供对象访问体验）
  @json('payload', identityJson) payload!: any | null

  // 仅本地存在标识
  @field('local_only') localOnly!: boolean | null

  // ---- 便捷只读属性（不入库） ----
  get isDeleted() {
    return !!this.deletedAt
  }
  get isEdited() {
    return !!this.editedAt && !this.isDeleted
  }
  get isPending() {
    return this.status === 'pending'
  }
}

/** Outbox 队列项（离线期间累计的操作） */
export class OutboxItem extends Model {
  static table = TABLES.outbox
  static associations: Associations = {}

  // 操作类型：create/edit/delete/ack…
  @field('op') op!: string

  // 作用域
  @field('chat_id') chatId!: string | null
  @field('target_id') targetId!: string | null

  // 幂等去重键
  @field('dedupe_key') dedupeKey!: string | null

  // 逻辑时间/并发控制
  @field('lamport') lamport!: number | null

  // 入队与重试
  @field('queued_at') queuedAt!: number
  @field('attempt') attempt!: number | null
  @field('last_error') lastError!: string | null

  // 具体负载（对象访问，底层字符串持久化）
  @json('payload', identityJson) payload!: any | null

  // ---- 便捷只读属性 ----
  get shouldRetry() {
    const n = this.attempt ?? 0
    return n < 5 // 最小实现：最多 5 次
  }
}

/** 通用 KV（游标/矢量时钟/设备信息等） */
export class Kv extends Model {
  static table = TABLES.kv
  static associations: Associations = {}

  // key / value(JSON) / 更新时间
  @field('k') k!: string
  @json('v', identityJson) v!: any | null
  @field('updated_at') updatedAt!: number
}

// 供 wm.ts 初始化 database 时统一导出
export const modelClasses = [Message, OutboxItem, Kv]
export type ModelClasses = typeof modelClasses[number]

// ---- 一些最小类型（可选）----
// 方便 sync-engine 的 Port 层书写类型（可按需扩展）
export type MessageStatus = 'pending' | 'sent' | 'failed' | 'acknowledged' | string

export interface MessageSnapshot {
  id: string // WatermelonDB 本地 id
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
  status?: MessageStatus | null
  payload?: any | null
  localOnly?: boolean | null
}

export interface OutboxRecord {
  id: string
  op: string
  chatId?: string | null
  targetId?: string | null
  dedupeKey?: string | null
  lamport?: number | null
  queuedAt: number
  attempt?: number | null
  lastError?: string | null
  payload?: any | null
}