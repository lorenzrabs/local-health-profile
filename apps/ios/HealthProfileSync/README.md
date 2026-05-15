# HealthProfileSync

Minimal SwiftUI companion app for V1 HealthKit sync.

## Run

1. Open `HealthProfileSync.xcodeproj` in Xcode.
2. Select your personal/team signing account if Xcode asks.
3. Run on a physical iPhone because HealthKit data is not available on macOS.
4. In the web dashboard, create a pairing token.
5. Paste the server URL and token into the app.
6. Grant Health permissions and sync the last 30 days.

The app is intentionally sync-only for V1. The main UI remains the local web dashboard.
