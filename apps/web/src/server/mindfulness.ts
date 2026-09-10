import type { AppDatabase } from "./db";
import type { MindfulnessSummary } from "../shared/types";
import { dateKeys, localInstant, shiftDate } from "../shared/dates";

// A derived view, never manual habit rows: sync cannot overwrite it or create
// duplicate habit definitions. No sample means unknown, not confirmed absence.
export function getMindfulnessSummary(
  db: AppDatabase,
  start: string,
  end: string,
): MindfulnessSummary {
  const rows = db
    .prepare(
      `SELECT start_at,end_at FROM health_samples
    WHERE type='mindfulSession' AND start_at<? AND end_at>? ORDER BY start_at`,
    )
    .all(localInstant(shiftDate(end, 1)), localInstant(start)) as {
    start_at: string;
    end_at: string;
  }[];
  const days: MindfulnessSummary["days"] = [];
  for (const date of dateKeys(start, end)) {
    const lo = Date.parse(localInstant(date)),
      hi = Date.parse(localInstant(shiftDate(date, 1)));
    const intervals = rows
      .map((r) => [
        Math.max(lo, Date.parse(r.start_at)),
        Math.min(hi, Date.parse(r.end_at)),
      ])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
      .sort((a, b) => a[0] - b[0]);
    let total = 0,
      left = 0,
      right = 0;
    for (const [a, b] of intervals) {
      if (a > right) {
        total += right - left;
        left = a;
        right = b;
      } else right = Math.max(right, b);
    }
    total += right - left;
    if (total > 0) days.push({ date, minutes: total / 60000 });
  }
  return {
    days: days.reverse(),
    totalMinutes: days.reduce((n, d) => n + d.minutes, 0),
    source: "appleHealth",
  };
}
