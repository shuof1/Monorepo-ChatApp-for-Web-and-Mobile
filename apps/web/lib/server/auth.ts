// apps/web/lib/server/auth.ts
export const runtime = 'nodejs';
import { cookies } from "next/headers";
import { adminAuth } from "./firebaseAdmin";
import { serialize } from "cookie";

const SESSION_COOKIE_NAME = "session";
const auth = adminAuth();

/** 校验前端传来的 idToken，返回用户信息 */
export async function verifyIdToken(idToken: string) {
  try {
    return await auth.verifyIdToken(idToken);
  } catch (err) {
    console.error("[auth] verifyIdToken failed:", err);
    return null;
  }
}

/** 设置 Session Cookie（默认 7 天） */
export async function setSessionCookie(idToken: string) {
  const expiresIn = 1000 * 60 * 60 * 24 * 7; // 7 days
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

  const cookieStr = serialize(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresIn / 1000,
  });

    (await cookies()).set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresIn / 1000,
  });

  return cookieStr;
}

/** 清理 Session Cookie */
export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

/** 从 cookie 中读取并验证 session */
export async function getUserFromSession() {
  const cookieStore = cookies();
  const sessionCookie = (await cookieStore).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    // const decoded  = await auth.verifySessionCookie(sessionCookie, true);
    // return { id: decoded.uid, email: decoded.email ?? null, raw: decoded };
    return await auth.verifySessionCookie(sessionCookie, true);
  } catch (err) {
    console.warn("[auth] verifySessionCookie failed:", err);
    return null;
  }
}
