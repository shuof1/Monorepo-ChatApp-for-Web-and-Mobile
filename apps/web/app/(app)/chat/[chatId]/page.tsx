'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { getFirebaseAuth } from '../../../../lib/firebase';
import { useChatSession } from './useChatSession';


export default function ChatPage() {
  const router = useRouter();
  const params = useParams<{ chatId: string }>();
  const searchParams = useSearchParams();
  const otherName = searchParams.get('name') || '';

  const auth = getFirebaseAuth();
  const me = auth?.currentUser;

  const otherId = params.chatId;
  const chatId = useMemo(() => {
    if (!me?.uid) return '';
    return [me.uid, otherId].sort().join('_'); // 与 mobile 一致
  }, [me?.uid, otherId]);

  // const [messages, setMessages] = useState<ChatMsg[]>([]);
  // const [message,setMessages] = useChatSession(chatId,me);
  const { messages, sendMessage, editMessage, deleteMessage } = useChatSession(chatId, me??null);

  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // 未登录直接回登录页
  useEffect(() => {
    if (me === null) router.replace('/login');
  }, [me, router]);


  // 发送消息（用事务防止覆盖）
  const onSend = async () => {
    if (!input.trim() || !me?.uid || !chatId) return;
    await sendMessage(input.trim());
    setInput(''); // 清空输入框
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); // 滚动到底部
    }, 100);
  };

  if (!me?.uid) {
    // 客户端守卫中，给个简单 loading
    return <div style={{ padding: 16, color: '#666' }}>Loading…</div>;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateRows: '60px 1fr 64px',
        background:
          'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(255,255,255,1) 100%)',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          color: '#fff',
          padding: '0 16px',
        }}
      >
        <button
          onClick={() => router.back()}
          style={{ marginRight: 12, background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }}
          aria-label="Back"
        >
          ←
        </button>
        <h3 style={{ margin: 0, fontWeight: 700 }}>
          Chat {otherName ? `with ${otherName}` : ''}
        </h3>
      </header>

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          overflowY: 'auto',
          padding: '12px 12px 0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.map((m) => {
          const mine = m.authorId === me.uid;                // ← 对齐 sync-engine 字段
          const time = (m.updatedAt ?? m.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <div
              key={m.id}                                    
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '10px 12px',
                borderRadius: 16,
                color: '#fff',
                background: m.deleted ? '#6b7280' : (mine ? '#4CAF50' : '#2196F3'),
                position: 'relative',
                wordBreak: 'break-word',
                opacity: m.deleted ? 0.7 : 1,
              }}
              title={m.deleted ? 'deleted' : undefined}
            >
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                {m.deleted ? '(deleted)' : ( m.updatedAt? m.text+' (edited)' : m.text)}
              </div>
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.85,
                  marginTop: 6,
                  textAlign: mine ? 'right' : 'left',
                }}
              >
                {time}{m.deleted?' · deleted ':m.updatedAt ? ' · edited' : ''}
              </div>

              {/* 可选：演示 edit/delete（真实 UI 可换成菜单/图标） */}
              {!m.deleted && mine && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: 12 }}>
                  <button
                    onClick={async () => {
                      const newText = prompt('Edit message:', m.text ?? '');
                      if (newText != null) await editMessage(m.id, newText);
                    }}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)', color: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMessage(m.id)}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)', color: '#fff', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div style={{ height: 12 }} />
      </div>

      {/* Input */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 88px',
          gap: 8,
          padding: 12,
          background: 'rgba(0,0,0,.75)',
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          style={{
            height: 40,
            borderRadius: 12,
            border: '1px solid #333',
            padding: '0 12px',
            outline: 'none',
            color: '#fff',
            background: 'rgba(255,255,255,.08)',
          }}
        />
        <button
          onClick={onSend}
          style={{
            height: 40,
            borderRadius: 12,
            border: 'none',
            fontWeight: 700,
            background: '#16a34a',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </main>
  );
}