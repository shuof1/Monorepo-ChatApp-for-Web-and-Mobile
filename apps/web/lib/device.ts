// apps/web/lib/device.ts
import { v4 as uuid } from "uuid";

const DEVICE_ID_KEY = "chatapp:deviceId";
const CLIENT_ID_KEY = "chatapp:clientId";

export function ensureDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// 可选：clientId 每次启动/每次登录生成一次（适合路由/Outbox会话）
export function ensureClientId(reset = false): string {
  if (reset) localStorage.removeItem(CLIENT_ID_KEY);
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = "web-" + uuid();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}
