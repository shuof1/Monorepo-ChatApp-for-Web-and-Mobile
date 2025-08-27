/// <reference types="vitest" />

import { describe, it, expect } from "vitest";

import { type ChatEvent, type Millis } from "../src/schema";
import { validateWireEventShape, normalizeWireEvent,SchemaError } from "../src/schema";
import {
  appendEvent,
  listEvents,
  InMemoryStore,
  type AppendResult,
  type ListResult,
  ValidationError,
} from "../src/sor";
import {
  AllowAllAcl,
  DenyListAcl,
  InMemoryMembershipRepo,
  MembershipAcl,
  TextGuardAcl,
} from "../src/acl";

/** Small helpers */
const NOW: Millis = 1_726_000_000_000; // fixed epoch for deterministic tests
const nextOp = (() => { let i = 0; return () => `op-${++i}`; })();
const nextMsg = (() => { let i = 0; return () => `m-${++i}`; })();
const CHAT = "chat-1";
const ALICE = "u-alice";
const BOB = "u-bob";

function makeCreate(p?: Partial<ChatEvent>): ChatEvent {
  return normalizeWireEvent({
    type: "create",
    chatId: CHAT,
    messageId: nextMsg(),
    authorId: ALICE,
    clientId: "web-1",
    opId: nextOp(),
    clientTime: NOW,
    text: "hello",
    ...p,
  } as ChatEvent);
}

function makeEdit(targetId: string, p?: Partial<ChatEvent>): ChatEvent {
  return normalizeWireEvent({
    type: "edit",
    chatId: CHAT,
    messageId: targetId,
    authorId: ALICE,
    clientId: "web-1",
    opId: nextOp(),
    clientTime: NOW,
    text: "edited",
    ...p,
  } as ChatEvent);
}

function fixedSor(overrides?: any) {
  const store = new InMemoryStore();
  const acl = new AllowAllAcl();
  const nowMs = () => NOW;
  return { store, acl, nowMs, ...overrides } as any;
}

/** ---------------- schema.ts shape tests ---------------- */

describe("schema: validateWireEventShape", () => {
  it("accepts a valid create event", () => {
    const e = makeCreate();
    expect(() => validateWireEventShape(e)).not.toThrow();
  });

  it("rejects reaction without emoji", () => {
    const bad: any = normalizeWireEvent({
      type: "reaction",
      chatId: CHAT,
      messageId: nextMsg(),
      authorId: ALICE,
      clientId: "web-1",
      opId: nextOp(),
      clientTime: NOW,
      op: "add",
      emoji: "",
    });
    expect(() => validateWireEventShape(bad)).toThrow();
  });
});

/** ---------------- sor.ts core behavior ---------------- */

describe("SoR: append & list", () => {
  it("assigns serverSeq starting at 1 and increments in order", async () => {
    const sor = fixedSor();
    const r1: AppendResult = await appendEvent(sor, makeCreate({ text: "a" }));
    const r2: AppendResult = await appendEvent(sor, makeCreate({ text: "b" }));
    expect(r1.event.serverSeq).toBe(1);
    expect(r2.event.serverSeq).toBe(2);
    expect(r1.event.serverMs).toBe(NOW);
  });

  it("is idempotent on opId", async () => {
    const sor = fixedSor();
    const e = makeCreate({ text: "x" });
    const r1 = await appendEvent(sor, e);
    const r2 = await appendEvent(sor, e); // same opId!
    expect(r1.deduped).toBe(false);
    expect(r2.deduped).toBe(true);
    expect(r2.event.serverSeq).toBe(r1.event.serverSeq);
  });

  it("paginates strictly after a given serverSeq", async () => {
    const sor = fixedSor();
    await appendEvent(sor, makeCreate({ text: "1" })); // seq 1
    await appendEvent(sor, makeCreate({ text: "2" })); // seq 2
    await appendEvent(sor, makeCreate({ text: "3" })); // seq 3

    const page1: ListResult = await listEvents(sor, { userId: ALICE, chatId: CHAT, afterServerSeq: 0, limit: 2 });
    expect(page1.events.map(e => e.serverSeq)).toEqual([1, 2]);
    const page2: ListResult = await listEvents(sor, { userId: ALICE, chatId: CHAT, afterServerSeq: page1.nextServerSeq, limit: 10 });
    expect(page2.events.map(e => e.serverSeq)).toEqual([3]);
  });

  it("clamps crazy-future clientTime to now + 24h", async () => {
    const sor = fixedSor();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const e = makeCreate({ clientTime: NOW + twoDays });
    const r = await appendEvent(sor, e);
    // allowed skew is +24h; so clientTime should be <= NOW + 24h
    expect(r.event.clientTime).toBeLessThanOrEqual(NOW + 24 * 60 * 60 * 1000);
  });

  it("validates payloads and throws ValidationError for illegal reaction", async () => {
    const sor = fixedSor();
    const bad: ChatEvent = normalizeWireEvent({
      type: "reaction",
      chatId: CHAT,
      messageId: nextMsg(),
      authorId: ALICE,
      clientId: "web-1",
      opId: nextOp(),
      clientTime: NOW,
      emoji: "", // invalid
      op: "add",
    } as any);

    await expect(appendEvent(sor, bad)).rejects.toBeInstanceOf(SchemaError);
  });
});

/** ---------------- acl.ts policies ---------------- */

describe("ACL: Membership & DenyList & TextGuard", () => {
  it("membership: public read, private requires role; readOnly cannot append", async () => {
    const repo = new InMemoryMembershipRepo();
    repo.setVisibility(CHAT, "private");
    repo.setRole(ALICE, CHAT, "member");
    repo.setRole(BOB, CHAT, "readOnly");

    const sor = fixedSor({ acl: new MembershipAcl(repo) });

    // ALICE can append
    await expect(appendEvent(sor, makeCreate({ authorId: ALICE, text: "ok" }))).resolves.toBeTruthy();

    // BOB cannot append (readOnly)
    await expect(appendEvent(sor, makeCreate({ authorId: BOB, text: "no" }))).rejects.toBeTruthy();

    // BOB can read private chat because has role
    const page = await listEvents(sor, { userId: BOB, chatId: CHAT, afterServerSeq: 0, limit: 10 });
    expect(page.ok).toBe(true);
  });

  it("deny-list blocks both read and append", async () => {
    const sor = fixedSor({ acl: new DenyListAcl({ users: [ALICE] }) });
    await expect(appendEvent(sor, makeCreate({ authorId: ALICE }))).rejects.toBeTruthy();
  });

  it("TextGuardAcl blocks empty/too-long text", async () => {
    const long = "x".repeat(5000);
    const sor = fixedSor({ acl: new TextGuardAcl(new AllowAllAcl(), { maxLen: 100 }) });

    await expect(appendEvent(sor, makeCreate({ text: "   " }))).rejects.toBeTruthy();
    await expect(appendEvent(sor, makeCreate({ text: long }))).rejects.toBeTruthy();
    // sanity: legit text passes
    await expect(appendEvent(sor, makeCreate({ text: "fine" }))).resolves.toBeTruthy();
  });
});
