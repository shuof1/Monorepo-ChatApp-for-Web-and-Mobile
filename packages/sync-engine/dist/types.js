// types.ts
export const compareClock = (a, b) => a.t === b.t ? (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0) : a.t - b.t;
// 类型守卫（更严谨）
export const isEncryptedEvent = (w) => w?.header?.v === 1 &&
    typeof w?.ciphertext === 'string' &&
    typeof w?.nonce === 'string';
export const isE2EEInvite = (w) => w?.header?.type === 'e2ee_invite';
export const isE2EEAck = (w) => w?.header?.type === 'e2ee_ack';
