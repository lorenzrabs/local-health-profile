# Architecture

## Components

- `apps/web`: Express API, Vite React UI, SQLite persistence, recommendation services, and tests.
- `apps/ios`: SwiftUI sync-only companion app that reads HealthKit with user permission and posts normalized batches to the local API.

## Local Data Flow

1. Web app starts a local server on port `3001`.
2. Dashboard creates a pairing token and QR payload.
3. iOS app stores server URL and token locally.
4. iOS app requests HealthKit read permissions and posts normalized samples/workouts to `/api/sync/healthkit`.
5. Dashboard combines objective HealthKit data with Daily Check-ins.
6. Recommendation engine produces a readiness score, risks, and suggested actions.

## Privacy Defaults

- Raw HealthKit data stays in local SQLite.
- AI analysis endpoint stores an input snapshot and uses minimized summaries.
- No external AI call is made unless a future implementation explicitly adds a provider key and client.
