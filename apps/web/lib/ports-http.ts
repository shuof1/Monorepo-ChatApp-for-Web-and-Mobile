// apps/web/lib/ports-http.ts
"use client";

import { v4 as uuid } from "uuid";
import type { ChatEvent } from "sync-engine";
type Millis = number;
// type ChatEvent = any; // 用你 sync-engine 里的类型替换
type Unsubscribe = () => void;

function now(): Millis { return Date.now(); }

function makeHeaders() {
  return { "Content-Type": "application/json" };
}

// ---- store: list / append / subscribe(轮询) ----
function createHttpStore(base = "/api/events") {
  let polling = new Map<string, { timer: any; last: number }>();

  async function list(p: { chatId: string; after?: number; limit?: number }) {
    const qs = new URLSearchParams();
    qs.set("chatId", p.chatId);
    if (p.after != null) qs.set("after", String(p.after));
    if (p.limit != null) qs.set("limit", String(p.limit));

    const res = await fetch(`${base}?${qs.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (res.status === 401) throw new Error("UNAUTHENTICATED");
    if (!res.ok) throw new Error(`LIST_FAILED_${res.status}`);
    return res.json(); // 期望形如 { events: ChatEvent[], serverSeq: number }
  }

  async function append(body: ChatEvent) {
    const res = await fetch(base, {
      method: "POST",
      credentials: "include",
      headers: makeHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 401) throw new Error("UNAUTHENTICATED");
    if (!res.ok) throw new Error(`APPEND_FAILED_${res.status}`);
    return res.json(); // 期望形如 { ok: true, serverSeq, serverTs }
  }

  function subscribe(chatId: string, onBatch: (evs: ChatEvent[]) => void, opts?: { intervalMs?: number }) : Unsubscribe {
    const interval = opts?.intervalMs ?? 1200;
    let last = 0;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        const data = await list({ chatId, after: last, limit: 200 });
        const evs = data?.events ?? [];
        if (evs.length) {
          onBatch(evs);
          // 更新 last：拿批次里最大的 serverSeq
          for (const e of evs) {
            if (typeof e.serverSeq === "number") last = Math.max(last, e.serverSeq);
          }
        }
      } catch (e: any) {
        // 401 则暂停订阅；其他错误忽略下次再试
        if (String(e?.message).includes("UNAUTHENTICATED")) {
          stopped = true;
          return;
        }
      } finally {
        if (!stopped) timers.timer = setTimeout(tick, interval);
      }
    };

    const timers = { timer: setTimeout(tick, 0) };
    polling.set(chatId, { timer: timers.timer, last });
    return () => {
      stopped = true;
      clearTimeout(timers.timer);
      polling.delete(chatId);
    };
  }

  return { list, append, subscribe };
}

// ---- 对齐 engine 需要的 ports 形状 ----
export function createWebPortsHttp() {
  const store = createHttpStore();
  const clock = { now };
  const ids = { deviceId: "web-" + uuid(), newId: uuid };
  return { store, clock, ids };
}
