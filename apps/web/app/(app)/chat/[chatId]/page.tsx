'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { getFirebaseAuth } from '../../../../lib/firebase';
import { useChatSession } from './useChatSession';

import { getLocal } from "../../../../lib/local";
import { kvKeyE2EEBind, makeE2EEId } from "../../../../lib/e2ee-utils";
import { getDeviceId } from "../../../../lib/device";
export default function ChatPage() {
  const [e2eeId, setE2eeId] = useState<string | null>(null);
  const [e2eeLoading, setE2eeLoading] = useState(false); // 初始就 false，避免“永久 …”
  const [autoJumped, setAutoJumped] = useState(false);
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
  const { messages, sendMessage, editMessage, deleteMessage,
    toggleReaction, inviteE2EE, acceptE2EE, pendingInvite, lastAck
  } = useChatSession(chatId, me ?? null);
  const EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // 封装成函数，便于多处触发
  const readE2EEBind = useCallback(async () => {
    const local = getLocal();
    setE2eeLoading(true);
    try {
      const myDeviceId = getDeviceId(); // ✅ 改成 localStorage 来源
      if (!myDeviceId || !chatId) {
        setE2eeId(null);
        return;
      }
      const key = kvKeyE2EEBind(chatId, myDeviceId);
      const value = await local.getKv<string>(key);
      console.log("[ChatPage] read e2ee bind from local", { key, value });
      setE2eeId(value ?? null);
    } finally {
      setE2eeLoading(false);
    }
  }, [chatId]);

  // 未登录直接回登录页
  useEffect(() => {
    if (me === null) router.replace('/login');
    readE2EEBind();
  }, [me?.uid, chatId, readE2EEBind]);

  // 监听 engine 写入后的事件，总能刷新到
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detailPlainId = (e as CustomEvent).detail?.plainId;
      if (detailPlainId === chatId) readE2EEBind();
    };
    window.addEventListener("e2ee:bind-updated", onUpdated);
    return () => window.removeEventListener("e2ee:bind-updated", onUpdated);
  }, [chatId, readE2EEBind]);

  // 收到 ack 也主动再读一次（防止事件丢失）
  useEffect(() => {
    if (lastAck) readE2EEBind();
  }, [lastAck, readE2EEBind]);

  const goToE2EE = useCallback(() => {
    if (!e2eeId) return;
    const q = otherName ? `?name=${encodeURIComponent(otherName)}` : "";
    router.push(`/chat_e2ee/${encodeURIComponent(e2eeId)}${q}`);
  }, [e2eeId, otherName, router]);

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
        <button
          className="px-3 py-1 rounded bg-blue-600 text-white"
          onClick={() => (e2eeId ? goToE2EE() : (otherId && inviteE2EE(otherId)))}
          disabled={!otherId || e2eeLoading}
        >
          {e2eeLoading ? "..." : e2eeId ? "Go to E2EE" : "Start E2EE Chat"}
        </button>
      </header>

      { }{/* Pending E2EE Invite Notification */}
      {pendingInvite && (
        <div className="p-3 rounded border bg-amber-50">
          <div className="mb-2"> He/She invites E2EE Chat </div>
          <button
            className="px-3 py-1 rounded bg-green-600 text-white"
            onClick={() => acceptE2EE()}>
            accept E2EE Invite
          </button>
        </div>
      )}

      {lastAck && (
        <div className="text-sm text-green-700"> E2EE Chat ✔</div>
      )}

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
          // 取出 reactions，规避 undefined
          const r = m.reactions ?? {};
          const myUid = me.uid;

          // 不在常用表情里的“额外反应”，也要显示（例如别人用的稀有表情）
          const extra = Object.keys(r).filter((e) => !EMOJIS.includes(e));
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
                {m.deleted ? '(deleted)' : (m.updatedAt ? m.text + ' (edited)' : m.text)}
              </div>
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.85,
                  marginTop: 6,
                  textAlign: mine ? 'right' : 'left',
                }}
              >
                {time}{m.deleted ? ' · deleted ' : m.updatedAt ? ' · edited' : ''}
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
              {!m.deleted && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[...EMOJIS, ...extra].map((emoji) => {
                    const users = r[emoji] ?? [];
                    const count = users.length;
                    const iReacted = users.includes(myUid);
                    return (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(m.id, emoji)}
                        title={iReacted ? '取消该表情' : '添加该表情'}
                        disabled={m.deleted}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.5)',
                          background: iReacted ? 'rgba(255,255,255,.2)' : 'transparent',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                        aria-pressed={iReacted}
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span style={{ fontSize: 12, marginLeft: 6 }}>{count}</span>}
                      </button>
                    );
                  })}


                  {/* 自定义表情（简单版，先用 prompt；以后可换 emoji picker） */}
                  <button
                    onClick={() => {
                      const e = prompt('React with emoji:');
                      if (e && e.trim()) toggleReaction(m.id, e.trim());
                    }}
                    title="添加其他表情"
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,.35)',
                      background: 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                    aria-label="Add reaction"
                  >
                    ➕
                  </button>

                </div>
              )

              }
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