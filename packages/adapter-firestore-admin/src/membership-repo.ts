import type { ChatId, UserId } from "sor-core";
import type { ChatRole, ChatVisibility, MembershipRepository } from "sor-core";
import { getDb } from "./firebase";

/** Firestore layout (suggested):
 *  chats/{chatId} {
 *    visibility: "public" | "private" // default private if missing
 *  }
 *  chats/{chatId}/members/{userId} {
 *    role: "owner" | "admin" | "member" | "readOnly"
 *  }
 */

export class FirestoreMembershipRepo implements MembershipRepository {
  private db = getDb();

  async getVisibility(chatId: ChatId): Promise<ChatVisibility> {
    const doc = await this.db.collection("chats").doc(chatId).get();
    const v = doc.exists ? (doc.get("visibility") as ChatVisibility | undefined) : undefined;
    return v ?? "private";
  }

  async getRole(userId: UserId, chatId: ChatId): Promise<ChatRole | undefined> {
    const doc = await this.db.collection("chats").doc(chatId).collection("members").doc(userId).get();
    const role = doc.exists ? (doc.get("role") as ChatRole | undefined) : undefined;
    return role ?? undefined;
  }
}
