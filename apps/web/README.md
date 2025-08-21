# 🖥️ Web ChatApp – Documentation

A Next.js powered chat application for browsers, seamlessly integrated with **Firestore** and the **Sync Engine** for real-time collaboration and offline support.

## ✨ Features

Real-time chat via Firestore backend

Edit & delete messages with **CRDT conflict resolution**

Offline-first mode with snapshots & queued Outbox

Responsive UI (desktop & mobile browsers)


## 🚀 Quick Start
```
cd apps/web
pnpm install
pnpm dev
```


App runs at http://localhost:3000
.

## 🛠️ Technology Stack

Framework: **Next.js (App Router)**

Database: **Firebase Firestore v9**

State Sync: **Sync Engine (CRDT event folding)**

Styling: **TailwindCSS**

Tooling: **pnpm**, **Turborepo**, **SWC**

## 📁 Project Structure
```
apps/web/
├── app/                      # Next.js app router pages
│   ├── (auth)/               # Authentication flows
│   └── (app)/chat/[chatId]   # Chat screens
├── lib/                      # Firebase + utility code
├── components/               # Reusable UI components
├── public/                   # Static assets
├── package.json
└── README.md
```

## 🤝 Contributing

Keep UI accessible (keyboard & screen-reader friendly).

Ensure Firestore queries are optimized.

Add screenshots when introducing UI features.

## 📊 Status

✅ Active – Core messaging & offline mode ready.
🚧 Planned – Media sharing, typing indicators.
