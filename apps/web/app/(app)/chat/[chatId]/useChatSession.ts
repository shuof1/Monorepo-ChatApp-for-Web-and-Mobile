// apps/web/app/chat/[chatId]/useChatSession.ts
"use client";
import { useEffect, useMemo, useState,useCallback } from "react";
import { createChatSession } from "../../../../lib/engine";
import type { ChatMsg } from "sync-engine";
import type { User } from "firebase/auth";

/**
 * 最小可用 hook：
 * - 订阅并聚合消息
 * - 提供 create/edit/delete 的便捷方法（自动填 authorId）
 */
export function useChatSession(chatId: string, me: User | null) {
  const session = useMemo(() => createChatSession(chatId), [chatId]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  // 订阅 fold 后的消息（这里简单转成数组，你也可以加排序）
  useEffect(() => {
    const off = session.subscribe((map) => {
      const arr = Array.from(map.values());
      // 可选：按 createdAt/updatedAt 排序
      arr.sort((a, b) => {
        const ta = (a.updatedAt ?? a.createdAt).getTime();
        const tb = (b.updatedAt ?? b.createdAt).getTime();
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

  return {
    session,          // 如果需要直接访问底层 API 也在这里
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
  };
}