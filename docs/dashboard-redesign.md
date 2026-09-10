# Dashboard redesign · 10.09.2026

The overview now prioritizes long-term trends, resting heart rate and active habits. The daily decision, readiness tile and running-heart-rate panel are no longer rendered. Pairing is collapsed in the header; recipes and manual habit recording remain available on demand.

## Analysis contract

- Archived habits and their entries are excluded from analysis, not deleted.
- The API defaults to explicitly recorded yes/no entries. The dashboard defaults to the user-confirmed tracked-day interpretation: missing entries on days with other active-habit records count as inferred no, starting at that habit’s first known record. Entirely untracked days and archive-only days remain unknown. A visible checkbox switches to explicit-only comparisons. Inferred control counts are shown, including in the resting-heart-rate panel. Stored entries are never rewritten. Table rates include these inferred no-days and explicitly show their count.
- Habit event rates use recorded days as the denominator. Tracking coverage uses calendar days. The weekly comparison requires three recorded days in each week and uses percentage points, not a success score.
- Comparisons use resting heart rate, HRV and overnight sleep on the next calendar day. Outcomes after the selected end date are excluded. At least seven measured yes-days and seven measured no-days are required.
- Group differences use medians. Existing mean fields remain in the API for compatibility. Group sizes remain visible. Larger groups are not a claim of statistical significance.
- No causal attribution, multiple-testing correction, or adjustment for illness, training or time trends. These are exploratory within-person comparisons, not treatment effects.
- Calendar days use Europe/Berlin, including daylight-saving transitions. Overlapping sleep stages are merged before summation. Missing nights are not zero hours.
- Resting-heart-rate baseline is the preceding 28 days, excluding the recent seven-day window. At least 4/7 and 14/28 measured days are required. A lower rate is not automatically better.
- No schema migration or health-data deletion is introduced. Authentication, pairing API, synchronization and persistent volume remain in place.

## General habit guidance

Recommendations are conservative and never encourage alcohol, nicotine or higher training intensity from an association. General sleep guidance: https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits
General activity guidance: https://www.heart.org/en/healthy-living/exercise-and-physical-activity

## Validation

43 tests, TypeScript and production build. Regression cases include archived entries, missing controls, outliers, insufficient paired samples, future outcomes, older habits without client IDs, DST, overlapping sleep intervals and insufficient baseline coverage. Existing API authentication/sync tests are retained.

`node --import tsx scripts/preview.mts` serves a disposable localhost preview on port 3012 with synthetic in-memory data. It does not open or modify the production database.

## Mindfulness and follow-up comparison update

`mindfulSession` is accepted by the sync API. The iOS companion requests this category from HealthKit and sends UUID, start/end, duration and source. A derived automatic habit panel shows dates and minutes; it does not write manual habit definitions or entries. Overlapping intervals merge, sessions crossing local midnight split correctly, and absent sessions never become no-days. Apple Health includes mindful sessions from multiple sources, so the label is Atmen / Achtsamkeit rather than an unverified Breathe-only classification.

The iPhone requires the updated companion app, Health permission for mindful minutes, and a historical sync. The Mac mini has Command Line Tools only: Swift syntax was parsed, but an iOS SDK build and physical-device sync require Xcode on the MacBook. No iPhone installation or new Health permission has occurred on the server.

47 web tests pass, including inferred controls, archive-only activity, no database mutation, repeated sync, overlapping mindful sessions, local midnight, invalid intervals and DST. Production build passes. No new dependencies or database schema changes.
