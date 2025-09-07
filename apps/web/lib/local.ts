"use client";
import { createLocalStorage } from "adapter-storage-wm";

let _local: ReturnType<typeof createLocalStorage> | null = null;

/** 获取 Web 端唯一的 local（IndexedDB）句柄 */
export function getLocal() {
  if (!_local) _local = createLocalStorage();
  return _local;
}
