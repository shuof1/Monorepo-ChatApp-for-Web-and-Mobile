// _reducer.ts
import { ChatEvent, ChatMsg, compareClock, Millis } from './types';




// 用 clientTime 作为逻辑时钟；serverTimeMs 仅用于展示或审计
const logicalTime = (e: ChatEvent): Millis => e.clientTime;
const clockOf = (e: ChatEvent) => ({ t: logicalTime(e), tie: e.opId });

export function foldEvents(events: ChatEvent[]): Map<string, ChatMsg> {
  const state = new Map<string, ChatMsg>();
  const version = new Map<string, { t: number; tie: string }>(); // 每条消息的最后时钟

  for (const ev of events) {
    const clk = clockOf(ev);
    const prev = version.get(ev.messageId);
    if (prev && compareClock(prev, clk) > 0) continue; // 老事件丢弃

    if (ev.type === 'create') {
      const existing = state.get(ev.messageId);
      // // —— 策略 A：允许“复活” ——（保留你当前行为）
      // state.set(ev.messageId, {
      //   id: ev.messageId,
      //   text: ev.text,
      //   authorId: ev.authorId,
      //   // createdAt：若已存在则不改；否则用本次事件时间
      //   createdAt: existing?.createdAt ?? new Date(logicalTime(ev)),
      //   // 如果之前被删，这里视为新版本，去掉 deleted
      //   updatedAt: existing ? new Date(logicalTime(ev)) : undefined,
      //   deleted: undefined,
      // });

      // —— 策略 B：禁止“复活”（如需，替换上面的分支）——
      if (!existing) {
        state.set(ev.messageId, {
          id: ev.messageId,
          text: ev.text,
          authorId: ev.authorId,
          createdAt: new Date(logicalTime(ev)),
        });
      }
    }

    else if (ev.type === 'edit') {
      const m =
        state.get(ev.messageId) ?? {
          id: ev.messageId,
          text: '',
          authorId: ev.authorId,
          createdAt: new Date(logicalTime(ev)), // 乱序到达时先建占位
        };
      m.text = ev.text;
      m.updatedAt = new Date(logicalTime(ev));
      state.set(ev.messageId, m);
    }

    else if (ev.type === 'delete') {
      const m =
        state.get(ev.messageId) ?? {
          id: ev.messageId,
          text: '',
          authorId: ev.authorId,
          createdAt: new Date(logicalTime(ev)),
        };
      m.deleted = true;
      m.updatedAt = new Date(logicalTime(ev));
      state.set(ev.messageId, m);
    }

    version.set(ev.messageId, clk);
  }

  return state;
}


