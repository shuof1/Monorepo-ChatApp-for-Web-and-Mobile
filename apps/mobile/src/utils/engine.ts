// import { foldEvents } from "sync-engine";
import { createRNPorts } from 'adapter-firestore-rn';
import { foldEvents, type ChatEvent, type ChatMsg, type Millis } from 'sync-engine';
import { v4 as uuid } from 'uuid';
import {
  createLocalStorage,
  createOutbox,
} from 'adapter-storage-wm';

export type Unsubscribe = () => void;

export interface ChatSession {
  getState(): Map<string, ChatMsg>;
  subscribe(fn: (state: Map<string, ChatMsg>) => void): Unsubscribe;
  start(): Promise<void>;
  stop(): void;
  create(p: { chatId: string; text: string; authorId: string; messageId?: string }): Promise<void>;
  edit(p: { chatId: string; messageId: string; text: string; authorId: string }): Promise<void>;
  del(p: { chatId: string; messageId: string; authorId: string }): Promise<void>;
}

function buildPorts() {
  return createRNPorts({
    deviceId: 'rn-' + uuid(),
    newId: uuid,
  });
}

export function createChatSession(chatId: string): ChatSession {
  const ports = buildPorts();

  // —— 新增：本地存储 & Outbox —— //
  const local = createLocalStorage()
  const outbox = createOutbox()

  let events: ChatEvent[] = [];
  let state = new Map<string, ChatMsg>();
  const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
  let unsub: Unsubscribe | null = null;
  let started = false;
  let lastKnownTime: Millis | undefined = undefined

  // 同步循环只启动一次
  let syncLoopStarted = false

  const notifyFromEvents = () => {
    state = foldEvents(events)
    listeners.forEach(fn => fn(state))
  }

  // 冷启动：先用本地快照“上屏”（离线可见）
  const notifyFromLocalSnapshot = async () => {
    const msgs = await local.getMessages(chatId, 200)
    const map = new Map<string, ChatMsg>()
    for (const m of msgs) {
      const id = (m.remoteId as any) ?? (m as any).id
      const createdAt = new Date(m.createdAt)
      const updatedAt = new Date(m.editedAt ?? m.createdAt)
      const msg = {
        id,
        messageId: id,
        chatId: m.chatId,
        authorId: m.authorId,
        text: m.text ?? undefined,
        createdAt,
        updatedAt,
        deleted: !!m.deletedAt,
        payload: m.payload ?? undefined,
      } as unknown as ChatMsg
      map.set(id, msg)
    }
    state = map
    listeners.forEach(fn => fn(state))
  }

  // 远端事件 → 本地快照
  const applyRemoteEventToLocal = async (ev: ChatEvent) => {
    const t = (ev.clientTime as number) ?? Date.now()
    if (ev.type === 'create') {
      await local.upsertMessage({
        remoteId: ev.messageId,
        chatId: ev.chatId,
        authorId: ev.authorId,
        text: ev.text ?? null,
        sortKey: t,
        createdAt: t,
        status: 'sent',
        payload: null,
        localOnly: false,
      })
    } else if (ev.type === 'edit') {
      await local.upsertMessage({
        remoteId: ev.messageId,
        chatId: ev.chatId,
        authorId: ev.authorId,
        text: ev.text ?? null,
        sortKey: t,
        createdAt: t,
        editedAt: t,
        status: 'sent',
        payload: null,
        localOnly: false,
      })
    } else if (ev.type === 'delete') {
      await local.upsertMessage({
        remoteId: ev.messageId,
        chatId: ev.chatId,
        authorId: ev.authorId,
        text: null,
        sortKey: t,
        createdAt: t,
        deletedAt: t,
        status: 'sent',
        payload: null,
        localOnly: false,
      })
    }
  }

  // Outbox → 后端（最小轮询）
  const ensureSyncLoop = () => {
    if (syncLoopStarted) return
    syncLoopStarted = true

    const tick = async () => {
      try {
        const batch = await outbox.peek(10, 5)
        for (const item of batch) {
          try {
            const ev = item.payload as ChatEvent
            await ports.store.append(ev)

            // 成功后把本地状态置为已发送
            const t = (ev.clientTime as number) ?? Date.now()
            await local.upsertMessage({
              remoteId: ev.messageId,
              chatId: ev.chatId,
              authorId: ev.authorId,
              text: ev.type === 'delete' ? null : (ev as any).text ?? null,
              sortKey: t,
              createdAt: t,
              editedAt: ev.type === 'edit' ? t : null,
              deletedAt: ev.type === 'delete' ? t : null,
              status: 'sent',
              localOnly: false,
            })

            await outbox.markDone(item.id)
          } catch (err) {
            await outbox.markFailed(item.id, err)
          }
        }
      } finally {
        setTimeout(tick, 800)
      }
    }

    tick()
  }


  const notify = () => {
    state = foldEvents(events);
    listeners.forEach(fn => fn(state));
  };

  const start = async () => {
    if (started) return;
    started = true;

    // 1) 本地快照立即可见
    await notifyFromLocalSnapshot()

    // 2) 远端初次加载
    const initial = await ports.store.list(chatId);
    events = events.concat(initial);
    notifyFromEvents()

    // --- 新增逻辑 ---
    // 找到本地最新事件的时间戳
    // let lastKnownTime: Millis | undefined = undefined;
    if (events.length > 0) {
      // 假设 events 已经按 clientTime 升序排列
      lastKnownTime  = events[events.length - 1].clientTime;
    }
    unsub = ports.store.subscribe(chatId, async (ev) => {
      if (lastKnownTime && ev.clientTime === lastKnownTime) {
        if (events.some(e => e.opId === ev.opId)) {
          // 忽略重复的事件
          return;
        }
      }
      events.push(ev)
      notifyFromEvents()
      await applyRemoteEventToLocal(ev)
      lastKnownTime = ev.clientTime
    });
    // 4) 启动 Outbox 同步
    ensureSyncLoop()
  };

  const stop = () => { unsub?.(); unsub = null; started = false; };

  const base = () => ({
    clientId: ports.ids.deviceId,
    opId: ports.ids.newId(),
    clientTime: ports.clock.now() as Millis,
  });

  return {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    start,
    stop,
    async create(p) {
      const ev: ChatEvent = { type: 'create', chatId, messageId: p.messageId ?? ports.ids.newId(), text: p.text, authorId: p.authorId, ...base() };
      // 本地乐观
      await applyRemoteEventToLocal(ev)
      events.push(ev); notify()

      // 入队 outbox
      await outbox.enqueue({
        op: 'create',
        chatId,
        targetId: ev.messageId,
        dedupeKey: `create:${chatId}:${ev.messageId}`,
        lamport: ev.clientTime as number,
        payload: ev,
      })
    },
    async edit(p) {
      const ev: ChatEvent = { type: 'edit', chatId, messageId: p.messageId, text: p.text, authorId: p.authorId, ...base() };
      await applyRemoteEventToLocal(ev)
      events.push(ev); notify()

      await outbox.enqueue({
        op: 'edit',
        chatId,
        targetId: ev.messageId,
        dedupeKey: `edit:${chatId}:${ev.messageId}:${ev.clientTime}`,
        lamport: ev.clientTime as number,
        payload: ev,
      })
    },
    async del(p) {
      const ev: ChatEvent = { type: 'delete', chatId, messageId: p.messageId, authorId: p.authorId, ...base() } as ChatEvent;
      await applyRemoteEventToLocal(ev)
      events.push(ev); notify()

      await outbox.enqueue({
        op: 'delete',
        chatId,
        targetId: ev.messageId,
        dedupeKey: `delete:${chatId}:${ev.messageId}:${ev.clientTime}`,
        lamport: ev.clientTime as number,
        payload: ev,
      })
    },
  };
}