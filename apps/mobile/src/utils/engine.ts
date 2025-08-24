// import { foldEvents } from "sync-engine";
import { createRNPorts } from 'adapter-firestore-rn';
import {
  type ChatEvent, type ChatMsg, type Millis,
} from 'sync-engine';
import { v4 as uuid } from 'uuid';
import {
  createLocalStorage,
  createOutbox,
} from 'adapter-storage-wm';
import { LoroDoc } from "loro-react-native";
import { applyEventToLoro, getAllMessagesFromDoc } from "./loro-utils";


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

  const doc = new LoroDoc();

  const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
  let unsub: Unsubscribe | null = null;
  let started = false;
  let lastKnownTime: Millis | undefined = undefined

  // 同步循环只启动一次
  let syncLoopStarted = false

  const getStateFromDoc = () => {
    return new Map(getAllMessagesFromDoc(doc).map(msg => [msg.id, msg]));
  }

  const notify = () => {
    const state = getStateFromDoc();
    listeners.forEach((fn) => fn(state));
  }


  // 冷启动：先用本地快照“上屏”（离线可见）
  const notifyFromLocalSnapshot = async () => {
    const msgs = await local.getMessages(chatId, 200)
    const state = new Map<string, ChatMsg>();
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
      state.set(id, msg);
    }
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


  // —— 发送事件的最小封装 —— //
  const base = () => ({
    clientId: ports.ids.deviceId,
    opId: ports.ids.newId(),
    clientTime: ports.clock.now() as Millis,
  });

  const start = async () => {
    if (started) return;
    started = true;

    // 1) 本地快照立即可见
    await notifyFromLocalSnapshot()

    // 2) 远端初次加载
    const initial = await ports.store.list(chatId);
    for (const ev of initial) {
      applyEventToLoro(doc, ev);
      await applyRemoteEventToLocal(ev);
    }

    if (initial.length > 0) {
      // 假设 events 已经按 clientTime 升序排列
      lastKnownTime = initial[initial.length - 1].clientTime;
    }
    notify();
    unsub = ports.store.subscribe(chatId, async (ev) => {
      if (lastKnownTime && ev.clientTime === lastKnownTime) {
        // 去重：仅根据 opId 可能不够，若未来使用 Loro sync，可移除
        return;
      }
      applyEventToLoro(doc, ev);
      await applyRemoteEventToLocal(ev);
      lastKnownTime = ev.clientTime;
      notify();
    });
    // 4) 启动 Outbox 同步
    ensureSyncLoop()
  };

  const stop = () => { unsub?.(); unsub = null; started = false; };



  return {
    getState: () => getStateFromDoc(),
    subscribe(fn) { listeners.add(fn); fn(getStateFromDoc()); return () => listeners.delete(fn); },
    start,
    stop,
    async create(p) {
      const ev: ChatEvent = { type: 'create', chatId, messageId: p.messageId ?? ports.ids.newId(), text: p.text, authorId: p.authorId, ...base() };
      // 本地乐观
      applyEventToLoro(doc, ev);
      await applyRemoteEventToLocal(ev);
      notify();

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
      applyEventToLoro(doc, ev);
      await applyRemoteEventToLocal(ev);
      notify();

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
      applyEventToLoro(doc, ev);
      await applyRemoteEventToLocal(ev);
      notify();

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