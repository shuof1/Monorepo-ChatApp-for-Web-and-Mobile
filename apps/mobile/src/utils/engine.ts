// import { foldEvents } from "sync-engine";
import { createRNPorts } from 'adapter-firestore-rn';
import { foldEvents, type ChatEvent, type ChatMsg, type Millis } from 'sync-engine';
import { v4 as uuid } from 'uuid';

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
  let events: ChatEvent[] = [];
  let state = new Map<string, ChatMsg>();
  const listeners = new Set<(s: Map<string, ChatMsg>) => void>();
  let unsub: Unsubscribe | null = null;
  let started = false;

  const notify = () => {
    state = foldEvents(events);
    listeners.forEach(fn => fn(state));
  };

  const start = async () => {
    if (started) return;
    started = true;
    const initial = await ports.store.list(chatId);
    events = events.concat(initial);
    notify();
    unsub = ports.store.subscribe(chatId, (ev) => { events.push(ev); notify(); });
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
      await ports.store.append(ev);
    },
    async edit(p) {
      const ev: ChatEvent = { type: 'edit', chatId, messageId: p.messageId, text: p.text, authorId: p.authorId, ...base() };
      await ports.store.append(ev);
    },
    async del(p) {
      const ev: ChatEvent = { type: 'delete', chatId, messageId: p.messageId, authorId: p.authorId, ...base() } as ChatEvent;
      await ports.store.append(ev);
    },
  };
}