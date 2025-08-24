// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    onConsoleLog(log, type) {
      // 默认行为是当测试通过时不打印日志
      // 返回 false 可以阻止 Vitest 的默认行为，从而强制打印
      return false;
    },
  },
});