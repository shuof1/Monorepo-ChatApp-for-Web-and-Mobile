// apps/web/lib/ports-http-compat.ts
"use client";
import { createWebPortsHttp } from "./ports-http";

import type { ChatEvent } from "sync-engine";

type SubscribeCompatOpts = {
    intervalMs?: number;
    sinceMs?: number; // 仅用于首次批量的时间过滤
};

export function createWebPortsHttpCompat() {
    const core = createWebPortsHttp(); // { store: { list, append, subscribe(onBatch) }, clock, ids }

    const compatStore = {
        ...core.store,

        // 兼容旧签名：onEvent（单条），opts.sinceMs
        subscribe(chatId: string, onEvent: (ev: any) => void, opts?: { intervalMs?: number; sinceMs?: number }) {
            let needFirstFilterByMs = typeof opts?.sinceMs === "number" && opts!.sinceMs > 0;
            const rawCutoff = opts?.sinceMs ?? 0;

            return core.store.subscribe(
                chatId,
                (batch: any[]) => {
                    let evs = batch;

                    if (needFirstFilterByMs) {
                        // 给 1.5s 余量，避免边界相等或时钟抖动把首批全过滤掉
                        const cutoff = rawCutoff - 1500;

                        // 只看 serverTimeMs；没有就退到 clientTime；都没有就别过滤
                        const canFilter = batch.some(e => typeof e.serverTimeMs === "number" || typeof e.clientTime === "number");
                        if (canFilter) {
                            evs = batch.filter(e => (e.serverTimeMs ?? e.clientTime ?? 0) > cutoff);
                        }

                        needFirstFilterByMs = false;
                    }

                    for (const ev of evs) onEvent(ev);
                },
                { intervalMs: opts?.intervalMs }
            );
        },
    };

    return { ...core, store: compatStore };
}
