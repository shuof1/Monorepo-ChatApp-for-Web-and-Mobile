/*
 * sor-core/src/acl.ts
 * ------------------------------------------------------------
 * Access control abstractions & default implementations for SoR.
 *
 * Philosophy
 *  - Keep this file *policy-focused* and runtime-agnostic.
 *  - Policies are small, composable, and testable.
 *  - Business rules like text length limits live in sor.ts; ACL here answers
 *    WHO can read/append in a given chat, optionally consulting repositories.
 */

import type { ChatEvent, ChatId, UserId } from "./schema";

/**
 * Primary ACL port consumed by sor.ts
 */
export interface AclPort {
  /** Return true if the author can append this event to the specified chat. */
  canAppend(authorId: UserId, chatId: ChatId, event: ChatEvent): Promise<boolean> | boolean;
  /** Return true if the user can read events for this chat. */
  canRead(userId: UserId, chatId: ChatId): Promise<boolean> | boolean;
}

/**
 * Trivial allow-all policy for local dev & tests.
 */
export class AllowAllAcl implements AclPort {
  canAppend(): boolean { return true; }
  canRead(): boolean { return true; }
}

/**
 * Simple deny-list policy for emergency blocks.
 */
export class DenyListAcl implements AclPort {
  private bannedUsers: Set<string>;
  private bannedChats: Set<string>;
  constructor(opts?: { users?: Iterable<string>; chats?: Iterable<string> }) {
    this.bannedUsers = new Set(opts?.users ?? []);
    this.bannedChats = new Set(opts?.chats ?? []);
  }
  canAppend(authorId: UserId, chatId: ChatId): boolean {
    if (this.bannedUsers.has(authorId)) return false;
    if (this.bannedChats.has(chatId)) return false;
    return true;
  }
  canRead(userId: UserId, chatId: ChatId): boolean {
    if (this.bannedUsers.has(userId)) return false;
    if (this.bannedChats.has(chatId)) return false;
    return true;
  }
}

/**
 * Visibility & Roles
 */
export type ChatVisibility = "public" | "private";
export type ChatRole = "owner" | "admin" | "member" | "readOnly";

export interface MembershipRecord {
  userId: UserId;
  chatId: ChatId;
  role: ChatRole;
}

export interface MembershipRepository {
  getVisibility(chatId: ChatId): Promise<ChatVisibility> | ChatVisibility;
  getRole(userId: UserId, chatId: ChatId): Promise<ChatRole | undefined> | (ChatRole | undefined);
}

/**
 * In-memory membership repo for testing.
 */
export class InMemoryMembershipRepo implements MembershipRepository {
  private vis = new Map<ChatId, ChatVisibility>();
  private roles = new Map<string, ChatRole>(); // key: chatId::userId

  setVisibility(chatId: ChatId, v: ChatVisibility) { this.vis.set(chatId, v); return this; }
  setRole(userId: UserId, chatId: ChatId, role: ChatRole) {
    this.roles.set(`${chatId}::${userId}`, role);
    return this;
  }
  getVisibility(chatId: ChatId): ChatVisibility { return this.vis.get(chatId) ?? "private"; }
  getRole(userId: UserId, chatId: ChatId): ChatRole | undefined { return this.roles.get(`${chatId}::${userId}`); }
}

/**
 * Membership-based policy:
 *  - Read: allowed if chat is public OR user is a member.
 *  - Append: allowed if user is a member AND role is not readOnly.
 */
export class MembershipAcl implements AclPort {
  constructor(private repo: MembershipRepository) {}

  async canRead(userId: UserId, chatId: ChatId): Promise<boolean> {
    const [vis, role] = await Promise.all([
      this.repo.getVisibility(chatId),
      this.repo.getRole(userId, chatId),
    ]);
    if (vis === "public") return true;
    return role !== undefined; // member of private chat
  }

  async canAppend(authorId: UserId, chatId: ChatId): Promise<boolean> {
    const role = await this.repo.getRole(authorId, chatId);
    if (!role) return false; // not a member
    if (role === "readOnly") return false;
    return true;
  }
}

/**
 * Composition helpers
 */
export class AllOfAcl implements AclPort {
  constructor(private policies: AclPort[]) {}
  async canRead(u: UserId, c: ChatId) {
    for (const p of this.policies) { if (!(await p.canRead(u, c))) return false; }
    return true;
  }
  async canAppend(a: UserId, c: ChatId, e: ChatEvent) {
    for (const p of this.policies) { if (!(await p.canAppend(a, c, e))) return false; }
    return true;
  }
}

export class AnyOfAcl implements AclPort {
  constructor(private policies: AclPort[]) {}
  async canRead(u: UserId, c: ChatId) {
    for (const p of this.policies) { if (await p.canRead(u, c)) return true; }
    return false;
  }
  async canAppend(a: UserId, c: ChatId, e: ChatEvent) {
    for (const p of this.policies) { if (await p.canAppend(a, c, e)) return true; }
    return false;
  }
}

/**
 * Text-guard decorator (optional):
 * Enforces simple content limits (length/blank) *as an ACL layer*.
 * Note: deeper business rules remain in sor.ts; use this when you want policy-only guards.
 */
export class TextGuardAcl implements AclPort {
  constructor(private inner: AclPort, private opts: { maxLen?: number } = {}) {}
  private max() { return this.opts.maxLen ?? 4000; }
  async canRead(u: UserId, c: ChatId) { return this.inner.canRead(u, c); }
  async canAppend(a: UserId, c: ChatId, e: ChatEvent) {
    if ((e.type === "create" || e.type === "edit" || e.type === "reply") && typeof (e as any).text === "string") {
      const text = (e as any).text.trim();
      if (text.length === 0) return false;
      if (text.length > this.max()) return false;
    }
    return this.inner.canAppend(a, c, e);
  }
}

/**
 * Factory helpers
 */
export function allowAll(): AclPort { return new AllowAllAcl(); }
export function deny(users?: Iterable<string>, chats?: Iterable<string>): AclPort { return new DenyListAcl({ users, chats }); }
export function membership(repo: MembershipRepository): AclPort { return new MembershipAcl(repo); }
export function allOf(...policies: AclPort[]): AclPort { return new AllOfAcl(policies); }
export function anyOf(...policies: AclPort[]): AclPort { return new AnyOfAcl(policies); }
