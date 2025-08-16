// types.ts
export type Millis = number;

// 逻辑时钟（Lamport-ish）。t 用 clientTime，tie 用 opId，当 t 相等时作为打平键。
export type Clock = { t: Millis; tie: string };

export const compareClock = (a: Clock, b: Clock) =>
  a.t === b.t ? (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0) : a.t - b.t;

// 事件基类，保证每个事件都有并发解决所需的最小字段
type BaseEvent = {
  chatId: string;
  messageId: string;
  authorId: string;
  clientId: string;         // 设备/客户端 id
  opId: string;             // 事件 id（uuid）
  clientTime: Millis;       // 本地时间戳 ms（进入 Clock.t）
  serverTimeMs?: Millis;    // 由适配器把 serverTimestamp() 转成毫秒后填充
};

export type ChatEvent =
  | (BaseEvent & {
      type: 'create';
      text: string;
    })
  | (BaseEvent & {
      type: 'edit';
      text: string;
    })
  | (BaseEvent & {
      type: 'delete';
    });

export type ChatMsg = {
  id: string;               // messageId
  text: string;
  authorId: string;
  createdAt: Date;          // 从 create.clientTime/serverTimeMs 推导
  updatedAt?: Date;         // 最近一次 edit 的时间（同上）
  deleted?: boolean;
};

// —— 可选：对 reducer 的最小接口约束 —— //
export type ChatState = { byId: Record<string, ChatMsg> };

export type ApplyEvent = (state: ChatState, ev: ChatEvent) => ChatState;
