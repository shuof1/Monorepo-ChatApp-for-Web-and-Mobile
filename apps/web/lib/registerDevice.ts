// apps/web/lib/registerDevice.ts
import { getDb } from "../lib/firebase"; // 你已有
import { doc, setDoc, serverTimestamp, updateDoc, getDoc } from "firebase/firestore";
import { ensureDeviceId, ensureClientId } from "./device";

export async function registerCurrentDeviceInFirestore(uid: string, keys?: {
  x25519Pub?: string;
  ed25519Pub?: string;
}) {
  const db = getDb();
  const deviceId = ensureDeviceId();
  const clientId = ensureClientId(/* reset? */ false);

  const ref = doc(db, "users", uid, "devices", deviceId);
  const snap = await getDoc(ref);

  const base = {
    deviceId,
    clientId,
    platform: "web",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    // 可选的密钥（公钥）
    x25519Pub: keys?.x25519Pub ?? null,
    ed25519Pub: keys?.ed25519Pub ?? null,
  };

  if (!snap.exists()) {
    await setDoc(ref, base);
  } else {
    await updateDoc(ref, {
      clientId,
      lastSeen: serverTimestamp(),
      ...(keys?.x25519Pub ? { x25519Pub: keys.x25519Pub } : {}),
      ...(keys?.ed25519Pub ? { ed25519Pub: keys.ed25519Pub } : {}),
    });
  }

  return { deviceId, clientId };
}
