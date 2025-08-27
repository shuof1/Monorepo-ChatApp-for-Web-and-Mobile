'use client'
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '../../../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';


export default function LoginPage() {
    const router = useRouter();
    const [phoneNumber, setPhoneNumber] = useState('');
    const [code, setCode] = useState('');
    const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);

    // 存放 reCAPTCHA 容器
    const recaptchaDivRef = useRef<HTMLDivElement | null>(null);
    // 防止重复初始化
    const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

    useEffect(() => {
        const auth = getFirebaseAuth();
        if (!auth) return;
        if (!recaptchaDivRef.current) return;
        if (recaptchaRef.current) return;
        recaptchaRef.current = new RecaptchaVerifier(
            auth,
            recaptchaDivRef.current!,
            {
                size: 'invisible',
                callback: () => {
                    //验证后sdk回调
                },
            }
        )
    }, []);
    const sendCode = async () => {
        const auth = getFirebaseAuth();
        if (!auth || !recaptchaRef.current) return;
        const phoneRegex = /$/;
        if (!phoneRegex.test(phoneNumber)) {
            alert('Invalid phone number, use E.164 like +1 111-111-1111');
            return;
        }
        setSending(true);
        try {
            const c = await signInWithPhoneNumber(auth, phoneNumber, recaptchaRef.current);
            setConfirm(c);
        } catch (e: any) {
            console.error(e);
            alert(e?.code ?? e?.message);
            // 失败可考虑 clear 再重建
            try { await recaptchaRef.current.clear(); recaptchaRef.current = null; } catch { }
        } finally {
            setSending(false);
        }
    };

    const confirmCode = async () => {
        if (!confirm || code.length !== 6) {
            alert('Invalid code');
            return;
        }
        setVerifying(true);
        try {
            const cred = await confirm.confirm(code);
            const idToken = await cred.user.getIdToken();
            const resp = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
            });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j?.error || 'Login API failed');
            }

            const meRes=await fetch('api/user/me',{credentials:'include',cache:'no-store'});
            if(!meRes.ok){
                const j = await meRes.json().catch(() => ({}));
                throw new Error(j?.error || 'Fetch user info failed');
            }
            const me=await meRes.json();
            const hasProfile= !!me?.user?.profile?.displayName;
            // const hasProfile = snap.exists() && typeof (snap.data()?.name) === 'string' && snap.data()!.name.length > 0;
            router.replace(hasProfile ? '/dashboard' : `/detail?uid=${cred.user.uid}`);
        } catch (e: any) {
            console.error(e);
            alert(e?.code ?? e?.message);
        } finally {
            setVerifying(false);
        }
    };

    return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb' }}>
            <div style={{ width: 360, background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.08)' }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, textAlign: 'center' }}>Bug Chat App</h1>

                {!confirm ? (
                    <>
                        <p style={{ color: '#666', marginTop: 24 }}>Enter your phone number</p>
                        <input
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="+1 111-111-1111"
                            style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 8, border: '1px solid #ddd' }}
                        />
                        <button
                            disabled={sending}
                            onClick={sendCode}
                            style={{ width: '100%', height: 44, marginTop: 16, borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600 }}
                        >
                            {sending ? 'Sending…' : 'Verify phone number'}
                        </button>
                    </>
                ) : (
                    <>
                        <p style={{ color: '#666', marginTop: 24 }}>Enter the 6-digit code</p>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="123456"
                            inputMode="numeric"
                            style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 8, border: '1px solid #ddd', letterSpacing: 4 }}
                        />
                        <button
                            disabled={verifying}
                            onClick={confirmCode}
                            style={{ width: '100%', height: 44, marginTop: 16, borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600 }}
                        >
                            {verifying ? 'Verifying…' : 'Confirm Code'}
                        </button>
                    </>
                )}

                {/* reCAPTCHA 容器（invisible 时也需要存在） */}
                <div ref={recaptchaDivRef} id="recaptcha-container" />
            </div>
        </main>
    );
}

