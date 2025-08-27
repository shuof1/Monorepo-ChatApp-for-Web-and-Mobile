'use client'

import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from "react";
import { getFirebaseAuth } from "../../lib/firebase";

type AuthUser = { id: string; email: string | null };

type AuthContextValue = {
    user: AuthUser | null;
    initializing: boolean;
    refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({ user: null, initializing: true, refresh: async () => { } });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [initializing, setInitializing] = useState(true);


    const inFlight = useRef(false);             // 防并发
    const hasTriedWithoutCookie = useRef(false);// 避免未登录时无限重试

    const hasSessionCookie = () =>
        typeof document !== 'undefined' && document.cookie.split('; ').some(c => c.startsWith('session='));

    const refresh = useCallback(async (force = false) => {
        if (inFlight.current) return;
        // 未登录且非强制，不请求（避免 401 风暴）
        if (!force && !hasSessionCookie()) {
            if (!hasTriedWithoutCookie.current) {
                // 首次探测：标记已探测过
                hasTriedWithoutCookie.current = true;
            }
            setUser(null);
            setInitializing(false);
            return;
        }

        inFlight.current = true;
        try {
            if (!force) setInitializing(true);
            const res = await fetch('/api/user/me', { credentials: 'include', cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setUser({ id: data.user.id, email: data.user.email ?? null });
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            inFlight.current = false;
            setInitializing(false);
        }
    }, []);

    // 首次挂载：只在有 cookie 时请求
    useEffect(() => { void refresh(false); }, [refresh]);

    // 前端 Firebase 登录态变化时，触发一次 refresh（不直接用 Firebase User）
    useEffect(() => {
        const auth = getFirebaseAuth?.();
        if (!auth) return;
        const unsub = onAuthStateChanged(auth, () => { void refresh(); });
        return () => unsub();
    }, [refresh]);

    // 页面重新获取焦点时，刷新一次会话（可选，但体验更稳）
    useEffect(() => {
        const onFocus = () => { void refresh(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refresh]);

    return <AuthContext.Provider value={{ user, initializing, refresh }}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
    return useContext(AuthContext);
}