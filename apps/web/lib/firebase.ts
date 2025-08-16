// lib/firebase.ts
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  // ... 您的配置保持不变
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 为了确保只初始化一次，我们使用单例模式
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let authInstance: Auth | null = null;

/**
 * 获取 Firestore 数据库实例（客户端专用）
 */
export const getDb = (): Firestore => {
  if (!dbInstance) {
    dbInstance = getFirestore(app);
  }
  return dbInstance;
};

/**
 * 获取 Storage 实例（客户端专用）
 */
export const getAppStorage = (): FirebaseStorage => {
  if (!storageInstance) {
    storageInstance = getStorage(app);
  }
  return storageInstance;
};

/**
 * 获取 Auth 实例（客户端专用）
 */
export const getFirebaseAuth = (): Auth => {
  if (!authInstance) {
    authInstance = getAuth(app);
  }
  return authInstance;
};