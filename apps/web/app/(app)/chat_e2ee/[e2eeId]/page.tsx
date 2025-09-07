"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getFirebaseAuth } from '../../../../lib/firebase';
import { getLocal } from "../../../../lib/local";
import { kvKeyE2EEBind, makeE2EEId,parseE2EEId } from "../../../../lib/e2ee-utils";
import { useChatSession } from "../../chat/[chatId]/useChatSession"; // 直接复用：传入 e2eeId 即可
import { getDeviceId } from "../../../../lib/device";
export default function E2EEChatPage() {
  const router = useRouter();
  const { e2eeId } = useParams<{ e2eeId: string }>();
  const searchParams = useSearchParams();
  const otherName = searchParams.get("name") || "";

  const auth = getFirebaseAuth();
  const me = auth?.currentUser;
  const [myDeviceId, setMyDeviceId] = useState<string | null>(null);
  const [kvMatch, setKvMatch] = useState<"checking" | "ok" | "missing" | "mismatch">("checking");
  const [notMyDevice, setNotMyDevice] = useState(false);

  // 解析 e2eeId -> plainId & 设备对
  const parsed = useMemo(() => {
    try {
      return parseE2EEId(decodeURIComponent(e2eeId));
    } catch {
      return null;
    }
  }, [e2eeId]);

  // 从 plainId 推导 otherId（你的明文路由需要 otherId）
  const otherId = useMemo(() => {
    if (!parsed?.plainId || !me?.uid) return "";
    const [a, b] = parsed.plainId.split("_");
    if (!a || !b) return "";
    return a === me.uid ? b : (b === me.uid ? a : ""); // 如果不包含我，返回空
  }, [parsed?.plainId, me?.uid]);

  // 拉取 myDeviceId + 校验“是否参与这对设备”
  useEffect(() => {
    let alive = true;
    (async () => {
      const did = getDeviceId();
      if (!alive) return;
      setMyDeviceId(did ?? null);

      if (!parsed) return;
      const amIParticipant = did && parsed.devices.includes(did);
      setNotMyDevice(!amIParticipant);
    })();
    return () => { alive = false; };
  }, [parsed]);

  // 校验本机 KV 绑定是否与当前 e2eeId 一致
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!parsed || !myDeviceId) return;
      setKvMatch("checking");
      const local = getLocal();
      const key = kvKeyE2EEBind(parsed.plainId, myDeviceId);
      const val = await local.getKv<string>(key);
      if (!alive) return;

      if (!val) setKvMatch("missing");
      else if (val !== decodeURIComponent(e2eeId)) setKvMatch("mismatch");
      else setKvMatch("ok");
    })();
    return () => { alive = false; };
  }, [parsed, myDeviceId, e2eeId]);

  // 复用 useChatSession，但 chatId 传 e2eeId（engine 内部见前缀走加密解密管道）
  const {
    messages, sendMessage, editMessage, deleteMessage,
    toggleReaction, inviteE2EE, acceptE2EE, pendingInvite, lastAck,
  } = useChatSession(parsed ? decodeURIComponent(e2eeId) : "", me ?? null);

  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // 未登录 → 去登录
  useEffect(() => {
    if (me === null) router.replace("/login");
  }, [me, router]);

  const backToPlain = useCallback(() => {
    if (!otherId) return;
    const q = otherName ? `?name=${encodeURIComponent(otherName)}` : "";
    router.push(`/chat/${otherId}${q}`);
  }, [otherId, otherName, router]);

  const onSend = useCallback(async () => {
    if (!input.trim() || !me?.uid || !parsed) return;
    await sendMessage(input.trim());
    setInput("");
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 100);
  }, [input, me?.uid, parsed, sendMessage]);

  // —— 几个典型异常态的 UI 处理 —— //
  if (!parsed) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 12, color: "#b91c1c" }}>Invalid E2EE chat id.</div>
        <button onClick={backToPlain} className="px-3 py-1 rounded bg-gray-700 text-white">Back</button>
      </div>
    );
  }

  if (!me?.uid) {
    return <div style={{ padding: 16, color: "#666" }}>Loading…</div>;
  }

  // 本机不是这对设备之一 → 这台设备没有密钥，无法解密
  if (notMyDevice) {
    return (
      <div style={{ padding: 16 }}>
        <div className="mb-2 text-red-600 font-medium">This device is not paired for this E2EE chat.</div>
        <div className="text-sm text-gray-600 mb-4">
          Switch to the paired device, or go back to the plain chat and re-invite E2EE.
        </div>
        <button onClick={backToPlain} className="px-3 py-1 rounded bg-gray-700 text-white">Back to plain chat</button>
      </div>
    );
  }

  // 绑定缺失/不一致给出提示（仍允许留在页内，避免抖动；也可选择直接 backToPlain）
  const bindBanner =
    kvMatch === "checking" ? "Checking secure binding…" :
    kvMatch === "missing"  ? "Secure binding not found on this device. You may need to accept the invite again." :
    kvMatch === "mismatch" ? "Binding mismatch. This chat id differs from your local binding. Re-pair if messages fail to decrypt." :
    null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "60px 1fr 64px",
        background: "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(34,197,94,0.15) 100%)",
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", color: "#fff", padding: "0 16px" }}>
        <button
          onClick={backToPlain}
          style={{ marginRight: 12, background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}
          aria-label="Back"
        >
          ←
        </button>
        <h3 style={{ margin: 0, fontWeight: 700 }}>Secure chat {otherName ? `with ${otherName}` : ""}</h3>
        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
          {kvMatch !== "ok" ? <span>⚠️ {bindBanner}</span> : <span>🔒 End-to-end encrypted</span>}
        </div>
      </header>

      {/* Optional incoming invite banner (rare in E2EE page) */}
      {pendingInvite && (
        <div className="m-3 p-3 rounded border bg-amber-50 text-amber-900">
          Incoming E2EE invite
          <button className="ml-3 px-3 py-1 rounded bg-green-600 text-white" onClick={() => acceptE2EE()}>
            Accept
          </button>
        </div>
      )}

      {lastAck && <div className="mx-3 my-2 text-sm text-green-400">E2EE handshake complete ✔</div>}

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          overflowY: "auto",
          padding: "12px 12px 0 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.map((m) => {
          const mine = m.authorId === me.uid;
          const time = (m.updatedAt ?? m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const r = m.reactions ?? {};
          const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];
          const extra = Object.keys(r).filter((e) => !EMOJIS.includes(e));
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "80%",
                padding: "10px 12px",
                borderRadius: 16,
                color: "#fff",
                background: m.deleted ? "#6b7280" : mine ? "#10b981" : "#2563eb",
                position: "relative",
                wordBreak: "break-word",
                opacity: m.deleted ? 0.7 : 1,
              }}
              title={m.deleted ? "deleted" : undefined}
            >
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                {/* 解密失败时 engine 应返回占位符文本（比如 "(unable to decrypt)"） */}
                {m.deleted ? "(deleted)" : (m.updatedAt ? m.text + " (edited)" : m.text)}
              </div>
              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 6, textAlign: mine ? "right" : "left" }}>
                {time}{m.deleted ? " · deleted " : m.updatedAt ? " · edited" : ""}
              </div>

              {!m.deleted && (
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[...EMOJIS, ...extra].map((emoji) => {
                    const users = r[emoji] ?? [];
                    const count = users.length;
                    const iReacted = users.includes(me.uid);
                    return (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(m.id, emoji)}
                        disabled={m.deleted}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,.5)",
                          background: iReacted ? "rgba(255,255,255,.2)" : "transparent",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                        aria-pressed={iReacted}
                        title={iReacted ? "取消该表情" : "添加该表情"}
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span style={{ fontSize: 12, marginLeft: 6 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ height: 12 }} />
      </div>

      {/* Input */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 88px", gap: 8, padding: 12, background: "rgba(0,0,0,.75)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }}}
          style={{ height: 40, borderRadius: 12, border: "1px solid #333", padding: "0 12px", outline: "none", color: "#fff", background: "rgba(255,255,255,.08)" }}
        />
        <button
          onClick={onSend}
          style={{ height: 40, borderRadius: 12, border: "none", fontWeight: 700, background: "#10b981", color: "#fff", cursor: "pointer" }}
        >
          Send
        </button>
      </div>
    </main>
  );
}
