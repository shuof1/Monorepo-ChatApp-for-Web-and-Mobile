// types.ts
export const compareClock = (a, b) => a.t === b.t ? (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0) : a.t - b.t;
