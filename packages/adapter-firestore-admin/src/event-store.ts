import { Millis } from "sor-core";
import type { EventStorePort, SorDeps } from "sor-core";
import type { StoredEvent, ChatEvent } from "sor-core";
import { EVENT_SCHEMA_VERSION } from "sor-core";
import { getDb } from "./firebase";

/**
 * Firestore schema (recommended):
 *  - ops/{opId}                       // idempotency map → { chatId, event, at }
 *  - chats/{chatId}/_meta/seq         // per-chat counter { value }
 *  - chats/{chatId}/events/{seqDocId} // event documents (seqDocId is padded serverSeq)
 */

const PAD = (n: number) => String(n).padStart(16, "0");

export function createFirestoreEventStore(): EventStorePort {
  const db = getDb();

  return {
    async append(e: ChatEvent, nowMs: Millis): Promise<StoredEvent> {
      return await db.runTransaction(async (tx) => {
        // 1) idempotency check
        const opRef = db.collection("ops").doc(e.opId);
        const opSnap = await tx.get(opRef);
        if (opSnap.exists) {
          const stored = opSnap.get("event") as StoredEvent | undefined;
          if (stored) return stored; // idempotent hit
        }

        // 2) per-chat sequence
        const chatRef = db.collection("chats").doc(e.chatId);
        const seqRef = chatRef.collection("_meta").doc("seq");
        const seqSnap = await tx.get(seqRef);
        const nextSeq = (seqSnap.exists ? (seqSnap.get("value") as number) : 0) + 1;

        const stored: StoredEvent = {
          ...e,
          v: e.v ?? EVENT_SCHEMA_VERSION,
          serverSeq: nextSeq,
          serverMs: nowMs,
          serverTimeMs: nowMs,
        };

        const eventsCol = chatRef.collection("events");
        const eventRef = eventsCol.doc(PAD(nextSeq));

        tx.set(seqRef, { value: nextSeq }, { merge: true });
        tx.set(eventRef, stored);
        tx.set(opRef, { chatId: e.chatId, event: stored, at: nowMs });

        return stored;
      });
    },

    async listAfter(chatId: string, afterServerSeq: number, limit: number): Promise<StoredEvent[]> {
      const snap = await db
        .collection("chats")
        .doc(chatId)
        .collection("events")
        .orderBy("serverSeq")
        .startAfter(afterServerSeq)
        .limit(limit)
        .get();
      return snap.docs.map((d) => d.data() as StoredEvent);
    },

    async getByOpId(opId: string): Promise<StoredEvent | undefined> {
      const doc = await db.collection("ops").doc(opId).get();
      return doc.exists ? ((doc.get("event") as StoredEvent) ?? undefined) : undefined;
    },
  };
}
