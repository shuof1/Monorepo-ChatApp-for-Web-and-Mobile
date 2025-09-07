# 🖥️ Web ChatApp – Documentation

A Next.js powered chat application for browsers, seamlessly integrated with **Firestore** and the **Sync Engine** for real-time collaboration and offline support.

## ✨ Features

- Real-time chat via Firestore backend

- Edit & delete messages with **CRDT conflict resolution**

- End-to-End Encrypted (E2EE) chat sessions

- Offline-first mode with snapshots & queued Outbox

- Responsive UI (desktop & mobile browsers)


## 🚀 Quick Start
```
cd apps/web
pnpm install
pnpm dev
```


App runs at http://localhost:3000
.

## 🛠️ Technology Stack

- Framework: **Next.js (App Router)**

- Database: **Firebase Firestore v9**

- State Sync: **Sync Engine (CRDT event folding)**

- Styling: **TailwindCSS**

- Tooling: **pnpm**, **Turborepo**, **SWC**

## 📁 Project Structure
```
apps/web/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Main application routes
│   │   ├── chat/[chatId]/        # Standard chat view
│   │   │   ├── page.tsx
│   │   │   └── useChatSession.ts
│   │   ├── chat_e2ee/[e2eeId]/   # End-to-end encrypted chat view
│   │   │   └── page.tsx
│   │   └── dashboard/            # Dashboard landing
│   │       └── page.tsx
│   ├── (auth)/                   # Authentication flows
│   │   ├── detail/page.tsx
│   │   └── login/page.tsx
│   └── api/                      # API routes
│       ├── events/               
│       │   ├── stream/route.ts   # SSE stream for events
│       │   └── route.ts          # Event append/list
│       ├── login/route.ts
│       ├── logout/route.ts
│       ├── user/
│       │   ├── me/route.ts
│       │   └── profile/route.ts
│       └── users/route.ts
│
├── components/
│   └── auth/AuthProvider.tsx     # Authentication provider
│
├── hooks/
│   └── useAuth.ts                # Custom auth hook
│
├── lib/
│   ├── server/                   # Server-side utilities
│   │   ├── auth.ts
│   │   └── firebaseAdmin.ts
│   ├── device.ts                 # Device registration helpers
│   ├── e2ee-utils.ts             # E2EE utilities
│   ├── engine.ts                 # Sync engine integration
│   ├── firebase.ts               # Firebase client setup
│   ├── local.ts                  # Local storage wrapper
│   ├── loro-utils.ts             # CRDT (Loro) helpers
│   ├── ports-http-compat.ts      # HTTP compatibility adapter
│   ├── ports-http.ts             # HTTP adapter
│   └── registerDevice.ts
│
├── utils/
│   └── loro-readers.ts           # Loro CRDT state readers
│
└── README.md                     # This documentation
```

## 🎯 Development Notes

- **Chats vs. Encrypted Chats**: Standard chats live under `/chat/[chatId]`, while E2EE sessions use `/chat_e2ee/[e2eeId]`.

- **Engine Integration**: `lib/engine.ts` connects the Sync Engine with Firestore events and local persistence.

- **Local Storage**: `lib/local.ts` wraps WatermelonDB/IndexedDB for offline-first design.

- **CRDT**: All message edits/deletes are folded through `loro-utils.ts.`

## 🤝 Contributing

Keep UI accessible (keyboard & screen-reader friendly).

Ensure Firestore queries are optimized.

Add screenshots when introducing UI features.

## 📊 Status

✅ Active – Messaging, E2EE, offline support functional.
🚧 Planned – Media sharing, typing indicators.
