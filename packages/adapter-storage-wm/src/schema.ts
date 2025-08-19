import { appSchema, tableName, tableSchema } from "@nozbe/watermelondb";

export const SCHEMA_VERSION = 1

// 统一表名，避免硬编码
export const TABLES = {
    messages: 'events',
    outbox: 'outbox',
    kv: 'kv',
} as const

/**
 * 最小可用 schema：
 * - messages：本地渲染所需的最小消息快照；不强依赖服务端 events 表结构
 * - outbox：离线期间累计的操作（create/edit/delete…），payload 按字符串保存（JSON.stringify）
 * - kv：通用键值（例如每个 chat 的 lastSyncedAt、vector clock、server cursor 等）
 *
 * 说明：
 * - WatermelonDB 列类型：string | number | boolean（没有 JSON），因此 payload/metadata 用 string 存
 * - 时间统一用毫秒时间戳（number, Unix ms）
 */

export const schema = appSchema({
    version: SCHEMA_VERSION,
    tables: [
        // 本地消息快照（渲染/查询友好）
        tableSchema({
            name: TABLES.messages,
            columns: [
                { name: 'remote_id', type: 'string', isOptional: true },

                // 所属会话
                { name: 'chat_id', type: 'string' },

                // 作者/发送者
                { name: 'author_id', type: 'string' },

                // 文本内容（富文本/附件请用 payload）
                { name: 'text', type: 'string', isOptional: true },

                // 排序键（通常=服务端创建时间或逻辑时间；用于稳定排序）
                { name: 'sort_key', type: 'number' },

                // 创建/编辑/删除时间（毫秒）
                { name: 'created_at', type: 'number' },
                { name: 'edited_at', type: 'number', isOptional: true },
                { name: 'deleted_at', type: 'number', isOptional: true },

                // 版本/逻辑时钟（CRDT/并发合并可用，先预留）
                { name: 'version', type: 'number', isOptional: true },
                { name: 'lamport', type: 'number', isOptional: true },
                // 版本/逻辑时钟（CRDT/并发合并可用，先预留）
                { name: 'version', type: 'number', isOptional: true },
                { name: 'lamport', type: 'number', isOptional: true },

                // 发送状态（pending/sent/failed）；用字符串便于扩展
                { name: 'status', type: 'string', isOptional: true },

                // 扩展信息（附件、编辑历史等 JSON 字符串）
                { name: 'payload', type: 'string', isOptional: true },

                // 是否仅本地存在（未上行/仅缓存）
                { name: 'local_only', type: 'boolean', isOptional: true }
            ]
        }),
        // Outbox 队列（离线操作）
        tableSchema({
            name: TABLES.outbox,
            columns: [
                // 操作类型：create/edit/delete/ack…（业务自定义）
                { name: 'op', type: 'string' },

                // 作用域（会话/目标）
                { name: 'chat_id', type: 'string', isOptional: true },
                { name: 'target_id', type: 'string', isOptional: true }, // 例如 messageId

                // 幂等/去重键（可选）
                { name: 'dedupe_key', type: 'string', isOptional: true },

                // 逻辑时间（CRDT/并发合并，可选）
                { name: 'lamport', type: 'number', isOptional: true },

                // 入队/重试信息
                { name: 'queued_at', type: 'number' },
                { name: 'attempt', type: 'number', isOptional: true }, // 重试次数
                { name: 'last_error', type: 'string', isOptional: true },

                // 具体操作负载（JSON.stringify）
                { name: 'payload', type: 'string', isOptional: true },
            ]
        }),
        // 通用键值（比如每个 chat 的 lastSyncedAt、server cursor、deviceId 等）
        tableSchema({
            name: TABLES.kv,
            columns: [
                { name: 'k', type: 'string' }, // 业务 key，如 `cursor:chat:{id}`
                { name: 'v', type: 'string' }, // 值（JSON.stringify）
                { name: 'updated_at', type: 'number' } // 更新时刻
            ]
        })
    ]
})


export type TableName = typeof TABLES[keyof typeof TABLES]
