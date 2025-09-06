// types.ts

import { LoroText } from 'loro-crdt';


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
      replyTo?: string;    
    })
  | (BaseEvent & {
      type: 'edit';
      text: string;
    })
  | (BaseEvent & {
      type: 'delete';
    })
  | (BaseEvent & {
      type: 'reaction';
      emoji: string;
      op: 'add' | 'remove';     // 表示是添加还是移除 reaction
    })
  | (BaseEvent & {
      type: 'reply';
      text: string;
      replyTo: string;         // 被回复的消息 ID
    });

export type ChatMsg = {
  id: string;               // messageId
  text: string;
  authorId: string;
  createdAt: Date;          // 从 create.clientTime/serverTimeMs 推导
  updatedAt?: Date;         // 最近一次 edit 的时间（同上）
  deleted?: boolean;
  reactions?: Record<string, string[]>; // emoji → userIds
  replyTo?: string;           // 被回复的消息ID
  replies?: string[];         // 该消息收到的回复列表
};


// 在 LoroDoc 中每条消息的结构：
export type InternalLoroChatMsg = {
  text: LoroText;
  authorId: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
  replyTo?: string;
  reactions: Map<string, string[]>; // emoji -> [userId...]
  replies: string[];                // 该消息收到的回复 messageIds
}

// —— 可选：对 reducer 的最小接口约束 —— //
export type ChatState = { byId: Record<string, ChatMsg> };

export type ApplyEvent = (state: ChatState, ev: ChatEvent) => ChatState;



/** ===== E2EE 相关 ===== **/

export type ClearHeader = {
  v: 1; // E2EE v1
  chatId: string;
  // 补齐 'reply'，并含控制事件类型
  type: 'create' | 'edit' | 'delete' | 'reaction' | 'reply' | 'e2ee_invite' | 'e2ee_ack';
  messageId: string;
  authorId: string;
  clientId: string;         // 与 BaseEvent 对齐，后续统一用 clientId
  // （可选）渐进迁移：保留但不使用
  deviceId?: string;         // 如果你想更严，直接 never，避免误用
  clientTime: number;
  opId: string;

  // 无 ACL 时用于精准路由控制事件（可选，但推荐）
  target?: { userId: string; deviceId?: string; clientId?: string };

  e2ee?: {
    mode: 'device-bound';
    receiverDeviceId?: string;  // 若你已在全链路用 clientId，可并存一个 receiverClientId
    receiverClientId?: string;  // 👍 推荐：逐步切到 clientId
    ephPubKey?: string;         // base64(X25519)——每条消息的轻量 PFS
  };

  // 可选：Ed25519 对 (header||ciphertext) 的 detached 签名
  sig?: string;
};

// 服务器不可见的密文体
export type SecretBody = {
  text?: string;
  payload?: any;
  reaction?: { emoji: string; op: 'add' | 'remove' };
  replyTo?: string; // 便于解密后直接应用 reducer
};

// 仅用于加密内容事件：密文/随机数设为必填更安全
export type EncryptedEvent = {
  header: ClearHeader;
  ciphertext: string;  // base64(AEAD密文)
  nonce: string;       // base64(AEAD随机数)
};

// 旧明文事件：直接别名，避免包内 import 自引用
export type PlainEvent = ChatEvent;

// 控制事件（握手，明文）
export type E2EEInvite = {
  header: Omit<ClearHeader, 'type'> & { type: 'e2ee_invite'; v: 1 };
  body: {
    inviterUserId: string;
    inviterDeviceId?: string;     // 可兼容旧字段
    inviterClientId?: string;     // 👍 推荐：统一 clientId
    inviterDevicePubX25519: string;   // base64
    inviterSignPubEd25519?: string;
    suggestedChatId: string;
    note?: string;
  };
  sig?: string;
};

export type E2EEAck = {
  header: Omit<ClearHeader, 'type'> & { type: 'e2ee_ack'; v: 1 };
  body: {
    accepterUserId: string;
    accepterDeviceId?: string;
    accepterClientId?: string;    // 👍 推荐
    accepterDevicePubX25519: string;
    accepterSignPubEd25519?: string;
    acceptedChatId: string;
  };
  sig?: string;
};

// 下行统一类型
export type WireEvent = PlainEvent | EncryptedEvent | E2EEInvite | E2EEAck;

// 类型守卫（更严谨）
export const isEncryptedEvent = (w: WireEvent): w is EncryptedEvent =>
  (w as any)?.header?.v === 1 &&
  typeof (w as any)?.ciphertext === 'string' &&
  typeof (w as any)?.nonce === 'string';

export const isE2EEInvite = (w: WireEvent): w is E2EEInvite =>
  (w as any)?.header?.type === 'e2ee_invite';

export const isE2EEAck = (w: WireEvent): w is E2EEAck =>
  (w as any)?.header?.type === 'e2ee_ack';
