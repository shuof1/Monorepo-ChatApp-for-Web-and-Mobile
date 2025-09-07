// apps/web/app/chat/[chatId]/useChatSession.ts
"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { createChatSession } from "../../../../lib/engine";
import type { ChatMsg, E2EEInvite, E2EEAck } from "sync-engine";
import type { User } from "firebase/auth";
import { getLocal } from "../../../../lib/local";
import { getDeviceId } from "../../../../lib/device";
import { kvKeyE2EEBind, makeE2EEId } from "../../../../lib/e2ee-utils";
/**
 * 最小可用 hook：
 * - 订阅并聚合消息
 * - 提供 create/edit/delete 的便捷方法（自动填 authorId）
 */
async function persistE2EEBind(plainId: string, ack: E2EEAck) {
  const local = getLocal();
  const myDeviceId = getDeviceId(); 
  if (!myDeviceId) return;

  // 1) 这条 ack 是否属于当前明文会话
  const acceptedChatId = (ack.body as any)?.acceptedChatId ?? ack.header.chatId;
  if (acceptedChatId && acceptedChatId !== plainId) return;

  // 2) 获取两端设备 ID（优先用 ack 自带字段）
  let inviterDeviceId =
    (ack.header as any)?.target?.deviceId ??
    // 兜底：如果 ack 里没带，就从之前 invite 落的 peer 缓存取
    (await local.getKv<any>(`kv:e2ee:peer:${plainId}`))?.deviceId ??
    null;

  const accepterDeviceId = (ack.body as any)?.accepterDeviceId ?? null;
  if (!inviterDeviceId || !accepterDeviceId) return;

  // 3) 防串端：只有当“本机设备”在这对配对设备里，才写绑定
  if (myDeviceId !== inviterDeviceId && myDeviceId !== accepterDeviceId) {
    // 不是本机参与的 E2EE，对本机不写 bind（可选：写一个占位标记显示🔒）
    return;
  }

  // 4) 生成 e2eeId（如 ack 自带 e2eeId 也可优先用）
  const e2eeId =
    (ack as any).e2eeId ?? makeE2EEId(plainId, inviterDeviceId, accepterDeviceId);

  const key = kvKeyE2EEBind(plainId, myDeviceId);
  const existing = await local.getKv<string>(key);
  if (existing !== e2eeId) {
    await local.setKv(key, e2eeId);
    window.dispatchEvent(new CustomEvent("e2ee:bind-updated", { detail: { plainId } }));
  }
}
export function useChatSession(chatId: string, me: User | null) {

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pendingInvite, setPendingInvite] = useState<E2EEInvite | null>(null);
  const [lastAck, setLastAck] = useState<E2EEAck | null>(null);
  const session = useMemo(() => createChatSession(chatId, {
    onInvite: (invite) => {
      const myUid = me?.uid;
      if (!myUid) return;
      if (invite.header.authorId === myUid) return;
      console.log("[useChatSession] received e2ee_invite", invite);
      setPendingInvite(invite);
    },
    onAck: (ack) => {
      console.log("[useChatSession] received e2ee_ack", ack);
      setLastAck(ack);
      void persistE2EEBind(chatId, ack);
    }
  }), [chatId, me?.uid]);

  // 订阅 fold 后的消息（这里简单转成数组，你也可以加排序）
  useEffect(() => {
    const off = session.subscribe((map) => {
      const arr = Array.from(map.values());
      // 可选：按 createdAt/updatedAt 排序
      arr.sort((a, b) => {
        const ta = (a.createdAt ?? a.updatedAt).getTime();
        const tb = (b.createdAt ?? b.updatedAt).getTime();
        return ta - tb;
      });
      setMessages(arr);
    });
    session.start();
    return () => {
      off();
      session.stop();
    };
  }, [session]);

  // —— 便捷发送函数（自动带上 authorId） —— //
  const sendMessage = useCallback(
    async (text: string) => {
      const authorId = me?.uid;
      if (!authorId || !chatId || !text.trim()) return;
      await session.create({ chatId, text: text.trim(), authorId });
    },
    [session, me?.uid, chatId]
  );

  const editMessage = useCallback(
    async (messageId: string, text: string) => {
      const authorId = me?.uid;
      if (!authorId || !chatId || !messageId || !text.trim()) return;
      await session.edit({ chatId, messageId, text: text.trim(), authorId });
    },
    [session, me?.uid, chatId]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const authorId = me?.uid;
      if (!authorId || !chatId || !messageId) return;
      await session.del({ chatId, messageId, authorId });
    },
    [session, me?.uid, chatId]
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const authorId = me?.uid;
      if (!authorId || !chatId || !messageId || !emoji) return;
      await session.addReaction({ chatId, messageId, emoji, authorId });
    },
    [session, me?.uid, chatId]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const authorId = me?.uid;
      if (!authorId || !chatId || !messageId || !emoji) return;
      await session.removeReaction({ chatId, messageId, emoji, authorId });
    },
    [session, me?.uid, chatId]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const authorId = me?.uid;
      if (!authorId || !chatId || !messageId || !emoji) return;
      await session.toggleReaction({ chatId, messageId, emoji, authorId });
    },
    [session, me?.uid, chatId]
  );

  const inviteE2EE = useCallback(
    async (inviteeUserId: string) => {
      const inviterUserId = me?.uid;
      if (!inviterUserId) return;
      return await session.inviteE2EE(inviterUserId, inviteeUserId);
    },
    [session, me?.uid]
  )

  // —— 新增：同意 E2EE（用 pendingInvite） —— //
  const acceptE2EE = useCallback(
    async () => {
      const accepterUserId = me?.uid;
      if (!accepterUserId || !pendingInvite) return;
      const ack = await session.acceptE2EE(pendingInvite, accepterUserId);
      setPendingInvite(null);
      // 立即写 KV，UI 能马上显示 “Go to E2EE”
      void persistE2EEBind(chatId, ack);
      return ack;
    },
    [session, me?.uid, pendingInvite,chatId]
  );


  return {
    session,          // 如果需要直接访问底层 API 也在这里
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,       // ✅ 新增
    removeReaction,    // ✅ 新增
    toggleReaction,    // ✅ 新增
    // 新增
    inviteE2EE,
    acceptE2EE,
    pendingInvite,
    lastAck,
  };
}