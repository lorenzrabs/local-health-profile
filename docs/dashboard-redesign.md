# Dashboard redesign · 10.09.2026

The overview now prioritizes long-term trends, resting heart rate and active habits. The daily decision, readiness tile and running-heart-rate panel are no longer rendered. Pairing is collapsed in the header; recipes and manual habit recording remain available on demand.

## Analysis contract

- Archived habits and their entries are excluded from analysis, not deleted.
- Only explicitly recorded yes/no entries are compared. Missing dates never become negative/control observations.
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
