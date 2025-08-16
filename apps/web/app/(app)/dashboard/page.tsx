'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getFirebaseAuth } from '../../../lib/firebase';          // 你之前写的 getter
import { getDb } from '../../../lib/firebase'; 
import { signOut } from 'firebase/auth';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

// 简单的类型
type UserRow = { id: string; name?: string };

export default function DashboardPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userName, setUserName] = useState<string>('');
  const db= getDb(); // 获取 Firestore 实例

  // 拉所有用户列表
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as UserRow[];
        setUsers(list);
      } catch (e) {
        console.error('error fetching users', e);
        alert('Error fetching users');
      }
    })();
  }, []);

  // 取当前用户的 name
  useEffect(() => {
    (async () => {
      try {
        const auth = getFirebaseAuth();
        const u = auth?.currentUser;
        if (!u) return;
        const me = await getDoc(doc(db, 'users', u.uid));
        setUserName((me.data() as any)?.name ?? '');
      } catch (e) {
        console.error("error fetching user's name", e);
        alert("Error fetching user's name");
      }
    })();
  }, []);

  const navigateToChat = (userId: string, name?: string) => {
    router.push(`/chat/${userId}?name=${encodeURIComponent(name ?? '')}`);
  };

  const handleLogout = async () => {
    try {
      const auth = getFirebaseAuth();
      if (!auth) return;
      await signOut(auth);
      router.replace('/login');
    } catch (e) {
      console.error('error logging out', e);
      alert('Error logging out');
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
      {/* 顶部黑色区域 */}
      <section
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '25%',
          color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center'
        }}
      >
        <h1 style={{ margin: '10px', fontSize: 32, fontWeight: 700 }}>Home</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 24, margin: 10 }}>Welcome, {userName || '...' }!</div>
          <button
            onClick={handleLogout}
            style={{ margin: 10, fontSize: 20, color: '#43A047', fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      </section>

      {/* 下方浅蓝容器 */}
      <section
        style={{
          position: 'absolute', top: '19%', left: 0, right: 0, bottom: 0,
          background: '#ADD8E6', padding: 8, borderTopRightRadius: 100, overflowY: 'auto'
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {users.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateToChat(item.id, item.name)}
              style={{
                width: '100%', marginBottom: 8, borderRadius: 24, overflow: 'hidden',
                border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, background: 'transparent'
              }}
            >
              {/* 代替 LinearGradient：CSS 线性渐变 */}
              <div style={{
                padding: 16, borderRadius: 24,
                background: 'linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(128,128,128,0) 100%)'
              }}>
                <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>
                  {item.name || '(no name)'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
