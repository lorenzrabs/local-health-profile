# Local Health Profile Dashboard V1

Local-first health dashboard with a TypeScript Web/API app, SQLite storage, and a minimal SwiftUI HealthKit sync companion.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3001`. The SQLite database is created at `apps/web/data/health.sqlite`.

## What V1 Includes

- German daily dashboard answering: "Was soll ich heute tun?"
- SQLite schema for profile, goals, recipes, supplements, HealthKit samples, workouts, check-ins, sync state, pairing tokens, and AI recommendations.
- Pairing token endpoint and QR payload for the iOS sync app.
- Idempotent HealthKit batch sync API.
- Daily check-in with pain, energy, recovery, nutrition, supplements, cigarettes, and notes.
- Deterministic local recommendation engine plus AI-analysis persistence hook.
- SwiftUI iOS companion source for HealthKit authorization and sync to the local backend.

## Useful Scripts

```bash
npm run dev       # run local API + web UI
npm test          # unit tests
npm run build     # typecheck + production build
```

## HealthKit Companion

Open `apps/ios/HealthProfileSync/HealthProfileSync.xcodeproj` in Xcode, set your signing team if needed, run on your iPhone, paste the server URL and pairing token from the web dashboard, then grant Health permissions.

This project is for personal wellness guidance and experimentation. It is not a medical device and does not provide diagnosis or treatment advice.
