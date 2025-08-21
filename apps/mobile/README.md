# 📱 Mobile ChatApp – Documentation

A **React Native + Expo** chat client delivering **cross-platform messaging** with Firestore backend and local persistence powered by **WatermelonDB**.

## ✨ Features

- Real-time messaging with Firestore

- Offline-first architecture with **Outbox queue**

  -  Persistent storage using **WatermelonDB**

  -  RN → SQLite

- Web → IndexedDB/LokiJS

- Message editing & deletion with CRDT consistency

- Smooth navigation with **React Navigation**

## 🚀 Quick Start
```
cd apps/mobile
pnpm install
pnpm --filter mobile exec expo prebuild
pnpm --filter mobile exec expo run:android
```

Runs in Expo environment.

## 🛠️ Technology Stack

Framework: **React Native + Expo**

Backend: **Firebase Firestore (via @react-native-firebase)**

Persistence: **WatermelonDB (SQLite/IndexedDB)**

Navigation: **React Navigation**

Tooling: **pnpm**, **Metro Bundler**

## 📁 Project Structure
```
apps/mobile/
├── src/
│   ├── components/          # Chat, Auth, Dashboard
│   ├── navigation/          # React Navigation setup
│   └── utils/               # Firebase & helpers
├── app.json                 # Expo config
├── package.json
└── README.md
```
## 🤝 Contributing

Test on both iOS & Android.

Ensure offline Outbox works before merging.

Maintain consistency with web client UX.

## 📊 Status

✅ Active – Core chat, offline mode functional.
🚧 Planned – Push notifications, media upload.
