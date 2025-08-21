# ⚙️ Sync Engine – Documentation

A **platform-agnostic CRDT-based synchronization engine** ensuring consistent chat state across Web and Mobile clients.

## ✨ Features

- Event-sourced **reducer** for message state

- Handles **Edit vs. Delete**, **Edit vs. Reply**, **Edit vs. Edit**

- Pure TypeScript, **no platform dependency**

- Extensible **ports/adapters** for Firestore & storage layers

- Supports real-time + offline folding of events

## 🚀 Quick Start (Development)
```
cd packages/sync-engine
pnpm install
pnpm build
```

## 🛠️ Technology Stack

- Language: **TypeScript**

- Architecture: **Event Sourcing + CRDT**

- Bundling: **tsup**


## 📁 Project Structure
```
packages/sync-engine/
├── src/
│   ├── types.ts          # ChatEvent / ChatMsg / Clock
│   ├── reducer.ts        # Pure reducer logic
│   ├── ports.ts          # Adapter interfaces
│   └── index.ts          # Public API
├── tests/                # Unit tests
├── package.json
└── README.md
```

## 🤝 Contributing

Keep reducer functions pure & deterministic.

Extend via ports, not direct DB access.

Add test coverage for new CRDT cases.

## 📊 Status

✅ Active – Stable core reducer and event folding.
🚧 Planned – Optimized merge strategies, vector clocks.
