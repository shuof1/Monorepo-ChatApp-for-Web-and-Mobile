# Monorepo ChatApp 💬✨
A unified monorepo powering cross-platform chat applications (Web & Mobile) with real-time sync, offline support, and CRDT-based conflict resolution.

## 🌟 Featured Projects
### 🖥️ **Web ChatApp**

A modern web chat client built with Next.js and Firebase Firestore.

**Key Features**:

- Real-time messaging with Firestore

- Message editing & deletion with CRDT consistency

- Offline-first mode with local persistence

- Responsive UI optimized for browsers

**Technologies**: Next.js, TypeScript, Firebase Firestore, CRDT strategies

🚀 Run: `apps/web` | 📖 Documentation

---

### 📱 **Mobile ChatApp**

A cross-platform chat client built with React Native and Expo.

**Key Features**:

- Real-time chat with Firestore backend

- Offline mode with WatermelonDB (SQLite / IndexedDB)

- Custom Outbox for queued edits & deletions

- Consistent CRDT merge across devices

- Smooth navigation with React Navigation

**Technologies**: React Native, Expo, TypeScript, Firebase, WatermelonDB

📱 Run: `apps/mobile` | 📖 Documentation

---

### ⚙️ Sync Engine

Core engine responsible for event folding, state management, and CRDT resolution, shared across Web & Mobile.

**Key Features**:

- Event-sourced reducer architecture

- Edit vs. Delete / Edit vs. Reply conflict handling

- Platform-agnostic ports & adapters

- Pure TypeScript, zero platform dependencies

**Technologies**: TypeScript, CRDTs, Event Sourcing

📦 Package: `packages/sync-engine` | 📖 Documentation

---

### 🔌 Adapters

Platform-specific adapters bridging the sync-engine with persistence & backend:

- **adapter-firestore-web** → Firestore v9 for Web

- **adapter-firestore-rn** → @react-native-firebase for RN

- **adapter-storage-wm** → WatermelonDB (SQLite for RN, IndexedDB/LokiJS for Web)

📦 Located under `packages/`
## 🚀 Quick Start
**Clone & Install**
```
git clone https://github.com/yourname/monorepo-chatapp.git
cd monorepo-chatapp
pnpm install
pnpm --filter mobile exec expo prebuild
```

**Run Web App**
```
pnpm --filter web dev
```

**Run Mobile App**
```
pnpm --filter mobile exec expo run:android   # or ios
```

## 🛠️ Technology Stack

- **Frameworks**: Next.js, React Native, Expo

- **Backend**: Firebase Firestore (real-time DB)

- **State & Sync**: Custom Sync Engine, CRDT strategies

- **Offline Persistence**: WatermelonDB (SQLite, IndexedDB, LokiJS)

- **Languages**: TypeScript, JavaScript

- **Build Tools**: TurboRepo, pnpm, Metro, SWC/Babel

- **Styling**: TailwindCSS (Web), React Native StyleSheet (Mobile)

## 📁 Project Structure
```
monorepo-chatapp/
├── apps/
│   ├── web/                     # Next.js web chat client
│   └── mobile/                  # React Native mobile app
├── packages/
│   ├── sync-engine/             # Core CRDT sync engine
│   ├── adapter-firestore-web/   # Firestore adapter for Web
│   ├── adapter-firestore-rn/    # Firestore adapter for RN
│   └── adapter-storage-wm/      # WatermelonDB storage adapter
├── turbo.json                   # Turborepo configuration
├── package.json                 # Root dependencies
└── README.md                    # This documentation
```
## 🎯 Project Goals

- **Cross-Platform**: Shared logic with platform-specific adapters

- **Offline-First**: Reliable messaging with local persistence & Outbox

- **Consistency**: Conflict-free CRDT merge for edits & deletes

- **Scalable**: Modular packages for future features (e.g. AI assistants, media sharing)

- **Open Source**: Encourage collaboration and contributions
