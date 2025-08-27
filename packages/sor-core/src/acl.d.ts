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
export declare class AllowAllAcl implements AclPort {
    canAppend(): boolean;
    canRead(): boolean;
}
/**
 * Simple deny-list policy for emergency blocks.
 */
export declare class DenyListAcl implements AclPort {
    private bannedUsers;
    private bannedChats;
    constructor(opts?: {
        users?: Iterable<string>;
        chats?: Iterable<string>;
    });
    canAppend(authorId: UserId, chatId: ChatId): boolean;
    canRead(userId: UserId, chatId: ChatId): boolean;
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
export declare class InMemoryMembershipRepo implements MembershipRepository {
    private vis;
    private roles;
    setVisibility(chatId: ChatId, v: ChatVisibility): this;
    setRole(userId: UserId, chatId: ChatId, role: ChatRole): this;
    getVisibility(chatId: ChatId): ChatVisibility;
    getRole(userId: UserId, chatId: ChatId): ChatRole | undefined;
}
/**
 * Membership-based policy:
 *  - Read: allowed if chat is public OR user is a member.
 *  - Append: allowed if user is a member AND role is not readOnly.
 */
export declare class MembershipAcl implements AclPort {
    private repo;
    constructor(repo: MembershipRepository);
    canRead(userId: UserId, chatId: ChatId): Promise<boolean>;
    canAppend(authorId: UserId, chatId: ChatId): Promise<boolean>;
}
/**
 * Composition helpers
 */
export declare class AllOfAcl implements AclPort {
    private policies;
    constructor(policies: AclPort[]);
    canRead(u: UserId, c: ChatId): Promise<boolean>;
    canAppend(a: UserId, c: ChatId, e: ChatEvent): Promise<boolean>;
}
export declare class AnyOfAcl implements AclPort {
    private policies;
    constructor(policies: AclPort[]);
    canRead(u: UserId, c: ChatId): Promise<boolean>;
    canAppend(a: UserId, c: ChatId, e: ChatEvent): Promise<boolean>;
}
/**
 * Text-guard decorator (optional):
 * Enforces simple content limits (length/blank) *as an ACL layer*.
 * Note: deeper business rules remain in sor.ts; use this when you want policy-only guards.
 */
export declare class TextGuardAcl implements AclPort {
    private inner;
    private opts;
    constructor(inner: AclPort, opts?: {
        maxLen?: number;
    });
    private max;
    canRead(u: UserId, c: ChatId): Promise<boolean>;
    canAppend(a: UserId, c: ChatId, e: ChatEvent): Promise<boolean>;
}
/**
 * Factory helpers
 */
export declare function allowAll(): AclPort;
export declare function deny(users?: Iterable<string>, chats?: Iterable<string>): AclPort;
export declare function membership(repo: MembershipRepository): AclPort;
export declare function allOf(...policies: AclPort[]): AclPort;
export declare function anyOf(...policies: AclPort[]): AclPort;
