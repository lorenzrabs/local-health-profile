import type {
  HabitAnalysis,
  HabitAnalysisItem,
  HabitCorrelation,
  HabitCorrelationMetric,
} from "../shared/types";
import { dateKeys, localDate, localInstant, shiftDate } from "../shared/dates";
import type { AppDatabase } from "./db";

type HabitRow = {
  id: number;
  client_id: string | null;
  name: string;
  is_active: number;
};
type Entry = { habit_id: number; date: string; completed: number };
const MIN_GROUP = 7;
const METRICS = [
  {
    id: "resting_hr",
    label: "Ruhepuls",
    unit: "bpm",
    type: "restingHeartRate",
  },
  { id: "hrv", label: "HRV", unit: "ms", type: "heartRateVariabilitySDNN" },
  { id: "sleep", label: "Schlafdauer", unit: "h", type: "sleepAnalysis" },
] as const;

export function getHabitAnalysis(
  db: AppDatabase,
  rangeDays: HabitAnalysis["rangeDays"] = 90,
  date = localDate(),
): HabitAnalysis {
  const start = shiftDate(date, 1 - rangeDays);
  const days = dateKeys(start, date);
  const habits = db
    .prepare(
      "SELECT id, client_id, name, is_active FROM habit_definitions WHERE is_active = 1 ORDER BY sort_order, id",
    )
    .all() as HabitRow[];
  const entries = db
    .prepare(
      `SELECT e.habit_id, e.date, e.completed FROM habit_entries e
    JOIN habit_definitions h ON h.id=e.habit_id WHERE h.is_active=1 AND e.date BETWEEN ? AND ? ORDER BY e.date`,
    )
    .all(start, date) as Entry[];
  const groups = new Map<number, Entry[]>();
  for (const e of entries)
    groups.set(e.habit_id, [...(groups.get(e.habit_id) ?? []), e]);
  const items = habits.map((h) => habitItem(h, groups.get(h.id) ?? [], days));
  const series = metricSeries(db, start, date);
  const correlations: HabitCorrelation[] = [];
  for (const item of items) {
    // Only explicit yes/no entries participate. Absence means unknown, never a control day.
    const records = groups.get(item.habitId) ?? [];
    for (const metric of METRICS) {
      const yes: number[] = [],
        no: number[] = [];
      for (const e of records) {
        const next = shiftDate(e.date, 1);
        if (next > date) continue;
        const value = series[metric.id].get(next);
        if (value !== undefined) (e.completed ? yes : no).push(value);
      }
      if (yes.length < MIN_GROUP || no.length < MIN_GROUP) continue;
      const eventMedian = median(yes)!,
        comparisonMedian = median(no)!;
      const delta = eventMedian - comparisonMedian;
      correlations.push({
        habitClientId: item.clientId,
        habitName: item.name,
        metric: metric.id,
        metricLabel: metric.label,
        unit: metric.unit,
        timing: "nextDay",
        eventDays: yes.length,
        comparisonDays: no.length,
        eventMedian,
        comparisonMedian,
        eventAverage: mean(yes),
        comparisonAverage: mean(no),
        delta,
        confidence:
          Math.min(yes.length, no.length) >= 14 ? "more_data" : "exploratory",
        summary:
          "Median am Folgetag: erfasstes Ereignis gegenüber ausdrücklich ohne Ereignis. Keine Aussage über die Ursache.",
        quality: "ok",
      });
    }
  }
  const metricWeight: Partial<Record<HabitCorrelationMetric, number>> = {
    resting_hr: 1,
    hrv: 5,
    sleep: 0.25,
  };
  correlations.sort(
    (a, b) =>
      Math.abs(b.delta ?? 0) / (metricWeight[b.metric] ?? 1) -
      Math.abs(a.delta ?? 0) / (metricWeight[a.metric] ?? 1),
  );
  const last = db
    .prepare(
      `SELECT MAX(e.date) AS date FROM habit_entries e JOIN habit_definitions h ON h.id=e.habit_id
    WHERE h.is_active=1 AND e.date<=?`,
    )
    .get(date) as { date: string | null };
  return {
    date,
    rangeDays,
    startDate: start,
    endDate: date,
    generatedAt: new Date().toISOString(),
    lastTrackedDate: last.date,
    recordedDays: new Set(entries.map((e) => e.date)).size,
    minimumGroupSize: MIN_GROUP,
    totalDays: days.length,
    items,
    correlations,
    notes: [
      "Nur aktive Habits. Fehlende Einträge zählen weder als Ja noch als Nein.",
      "Verglichen werden Tageswerte am Folgetag, mindestens 7 Mess-Tage je Gruppe. Der Median begrenzt den Einfluss einzelner Ausreißer.",
      "Beobachtete Unterschiede sind keine Wirkungsnachweise. Training, Krankheit, andere Habits und zeitliche Trends können mitwirken.",
      "Kalendertage: Europe/Berlin. Schlaf wird der Nacht vor dem jeweiligen Morgen zugeordnet; überlappende Schlafintervalle werden zusammengeführt.",
    ],
  };
}

function habitItem(
  h: HabitRow,
  entries: Entry[],
  days: string[],
): HabitAnalysisItem {
  const events = new Set(entries.filter((e) => e.completed).map((e) => e.date));
  const tracked = new Set(entries.map((e) => e.date));
  let streak = 0,
    longest = 0;
  for (const d of days) {
    streak = events.has(d) ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  const end = days.at(-1)!;
  const recent = entries.filter((e) => e.date >= shiftDate(end, -6));
  const previous = entries.filter(
    (e) => e.date >= shiftDate(end, -13) && e.date < shiftDate(end, -6),
  );
  const rate = (rows: Entry[]) =>
    rows.length ? rows.filter((e) => e.completed).length / rows.length : null;
  return {
    habitId: h.id,
    clientId: h.client_id ?? `server-${h.id}`,
    name: h.name,
    isActive: true,
    trackedDays: tracked.size,
    missingDays: days.length - tracked.size,
    nonEventDays: tracked.size - events.size,
    eventDays: events.size,
    trackingRate: tracked.size / days.length,
    eventRate: rate(entries) ?? 0,
    currentStreak: streak,
    longestStreak: longest,
    lastEventDate: [...events].sort().at(-1) ?? null,
    recentRate: rate(recent),
    previousRate: rate(previous),
    recentTrackedDays: recent.length,
    previousTrackedDays: previous.length,
    weekdays: [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
      const recorded = days.filter(
        (d) =>
          tracked.has(d) && new Date(`${d}T12:00:00Z`).getUTCDay() === weekday,
      );
      const eventDays = recorded.filter((d) => events.has(d)).length;
      return {
        weekday,
        label: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][weekday],
        eventDays,
        totalDays: recorded.length,
        eventRate: recorded.length ? eventDays / recorded.length : 0,
      };
    }),
  };
}

function metricSeries(db: AppDatabase, start: string, end: string) {
  const result: Record<"resting_hr" | "hrv" | "sleep", Map<string, number>> = {
    resting_hr: new Map(),
    hrv: new Map(),
    sleep: new Map(),
  };
  for (const metric of METRICS.filter((m) => m.id !== "sleep")) {
    const rows = db
      .prepare(
        `SELECT start_at, value FROM health_samples WHERE type=? AND start_at>=? AND start_at<? ORDER BY start_at`,
      )
      .all(
        metric.type,
        localInstant(start),
        localInstant(shiftDate(end, 1)),
      ) as { start_at: string; value: number }[];
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      if (!Number.isFinite(row.value) || row.value <= 0) continue;
      const day = localDate(row.start_at);
      groups.set(day, [...(groups.get(day) ?? []), row.value]);
    }
    for (const [day, values] of groups)
      result[metric.id].set(day, mean(values)!);
  }
  // One indexed read, instead of a separate database query for every night.
  const sleeps = db
    .prepare(
      `SELECT start_at,end_at FROM health_samples WHERE type='sleepAnalysis' AND value IN (1,3,4,5)
    AND start_at<? AND end_at>? ORDER BY start_at`,
    )
    .all(localInstant(end, 14), localInstant(shiftDate(start, -1), 18)) as {
    start_at: string;
    end_at: string;
  }[];
  for (const day of dateKeys(start, end)) {
    const lo = Date.parse(localInstant(shiftDate(day, -1), 18)),
      hi = Date.parse(localInstant(day, 14));
    const intervals = sleeps
      .map((s) => [
        Math.max(lo, Date.parse(s.start_at)),
        Math.min(hi, Date.parse(s.end_at)),
      ])
      .filter(([a, b]) => b > a)
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
    if (intervals.length) result.sleep.set(day, total / 3600000);
  }
  return result;
}
function mean(values: number[]) {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}
export function median(values: number[]) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const n = Math.floor(v.length / 2);
  return v.length % 2 ? v[n] : (v[n - 1] + v[n]) / 2;
}
