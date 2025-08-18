// src/types.ts
var compareClock = (a, b) => a.t === b.t ? a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0 : a.t - b.t;

// src/_reducer.ts
var logicalTime = (e) => e.clientTime;
var clockOf = (e) => ({ t: logicalTime(e), tie: e.opId });
function foldEvents(events) {
  const state = /* @__PURE__ */ new Map();
  const version = /* @__PURE__ */ new Map();
  for (const ev of events) {
    const clk = clockOf(ev);
    const prev = version.get(ev.messageId);
    if (prev && compareClock(prev, clk) > 0) continue;
    if (ev.type === "create") {
      const existing = state.get(ev.messageId);
      if (!existing) {
        state.set(ev.messageId, {
          id: ev.messageId,
          text: ev.text,
          authorId: ev.authorId,
          createdAt: new Date(logicalTime(ev))
        });
      }
    } else if (ev.type === "edit") {
      const m = state.get(ev.messageId) ?? {
        id: ev.messageId,
        text: "",
        authorId: ev.authorId,
        createdAt: new Date(logicalTime(ev))
        // 乱序到达时先建占位
      };
      m.text = ev.text;
      m.updatedAt = new Date(logicalTime(ev));
      state.set(ev.messageId, m);
    } else if (ev.type === "delete") {
      const m = state.get(ev.messageId) ?? {
        id: ev.messageId,
        text: "",
        authorId: ev.authorId,
        createdAt: new Date(logicalTime(ev))
      };
      m.deleted = true;
      m.updatedAt = new Date(logicalTime(ev));
      state.set(ev.messageId, m);
    }
    version.set(ev.messageId, clk);
  }
  return state;
}
export {
  compareClock,
  foldEvents
};
