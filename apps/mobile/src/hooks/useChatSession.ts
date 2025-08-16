// apps/mobile/src/hooks/useChatSession.ts
import { useEffect, useMemo, useState, useCallback } from 'react';
import auth from '@react-native-firebase/auth';
import type { ChatMsg } from 'sync-engine';
import { createChatSession } from '../utils/engine';

export type GiftedMsg = {
  _id: string;
  text: string;
  createdAt: Date;
  user: { _id: string; name?: string };
};

function toGifted(m: ChatMsg): GiftedMsg {
  return {
    _id: m.id,
    text: m.deleted ? '(deleted)' : (m.text ?? ''),
    createdAt: m.updatedAt ?? m.createdAt,
    user: { _id: m.authorId },
  };
}

export function useChatSession(chatPartnerId: string) {
  const me = auth().currentUser;
  const chatId = useMemo(() => {
    if (!me?.uid) return '';
    return [me.uid, chatPartnerId].sort().join('_');
  }, [me?.uid, chatPartnerId]);

  const session = useMemo(() => createChatSession(chatId), [chatId]);
  const [messages, setMessages] = useState<GiftedMsg[]>([]);

  useEffect(() => {
    const off = session.subscribe((map) => {
      const arr = Array.from(map.values()).map(toGifted);
      // GiftedChat 需要“最新在前”
      arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setMessages(arr);
    });
    session.start();
    return () => { off(); session.stop(); };
  }, [session]);

  const sendMessage = useCallback(async (text: string) => {
    const authorId = me?.uid;
    if (!chatId || !authorId || !text.trim()) return;
    await session.create({ chatId, text: text.trim(), authorId });
  }, [session, chatId, me?.uid]);

  const editMessage = useCallback(async (messageId: string, text: string) => {
    const authorId = me?.uid;
    if (!chatId || !authorId || !messageId || !text.trim()) return;
    await session.edit({ chatId, messageId, text: text.trim(), authorId });
  }, [session, chatId, me?.uid]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const authorId = me?.uid;
    if (!chatId || !authorId || !messageId) return;
    await session.del({ chatId, messageId, authorId });
  }, [session, chatId, me?.uid]);

  return { messages, sendMessage, editMessage, deleteMessage, me };
}
