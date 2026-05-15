import type { HabitAnalysis, HabitAnalysisItem, HabitCorrelation, HabitCorrelationMetric } from "../shared/types";
import type { AppDatabase } from "./db";

type RangeDays = HabitAnalysis["rangeDays"];
type HabitRow = {
  id: number;
  client_id: string | null;
  name: string;
  sort_order: number;
  is_active: number;
};
type EntryRow = {
  habit_id: number;
  habit_client_id: string | null;
  date: string;
  completed: number;
};
type PointRow = { date: string; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EVENT_VALUES = 3;
const MIN_COMPARISON_VALUES = 10;

const METRICS: Array<{ id: HabitCorrelationMetric; label: string; unit: string }> = [
  { id: "resting_hr", label: "Ruhepuls", unit: "bpm" },
  { id: "hrv", label: "HRV", unit: "ms" },
  { id: "sleep", label: "Schlaf", unit: "h" },
  { id: "steps", label: "Schritte", unit: "" },
  { id: "active_energy", label: "Aktive Energie", unit: "kcal" },
  { id: "running_distance", label: "Laufdistanz", unit: "km" }
];

export function getHabitAnalysis(db: AppDatabase, rangeDays: RangeDays = 90, date = toDateKey(new Date())): HabitAnalysis {
  const end = new Date(`${date}T00:00:00.000Z`);
  const start = addDays(end, -rangeDays + 1);
  const days = dateRange(start, end);
  const habits = queryHabits(db);
  const entries = queryEntries(db, start, end);
  const entriesByHabit = groupEntries(entries);
  const metricSeries = buildMetricSeries(db, start, addDays(end, 2));
  const items = habits.map((habit) => buildHabitItem(habit, entriesByHabit.get(habit.id) ?? [], days));

  return {
    date,
    rangeDays,
    startDate: toDateKey(start),
    endDate: date,
    generatedAt: new Date().toISOString(),
    totalDays: days.length,
    items,
    correlations: buildCorrelations(items, days, metricSeries).slice(0, 24),
    notes: [
      "Toggle an bedeutet in dieser V1-Analyse: Ereignis passiert.",
      "Zusammenhänge sind deskriptive Korrelationen, keine Ursache-Wirkung-Aussagen.",
      "Korrelationen werden nur bei ausreichender Anzahl an Ereignis- und Vergleichstagen angezeigt."
    ]
  };
}

function queryHabits(db: AppDatabase) {
  return db
    .prepare(
      `SELECT id, client_id, name, sort_order, is_active
       FROM habit_definitions
       ORDER BY sort_order, id`
    )
    .all() as HabitRow[];
}

function queryEntries(db: AppDatabase, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT habit_entries.habit_id, habit_definitions.client_id AS habit_client_id,
              habit_entries.date, habit_entries.completed
       FROM habit_entries
       JOIN habit_definitions ON habit_definitions.id = habit_entries.habit_id
       WHERE habit_entries.date >= ?
         AND habit_entries.date <= ?
       ORDER BY habit_entries.date`
    )
    .all(toDateKey(start), toDateKey(end)) as EntryRow[];
}

function buildHabitItem(habit: HabitRow, entries: EntryRow[], days: string[]): HabitAnalysisItem {
  const trackedDates = new Set(entries.map((entry) => entry.date));
  const eventDates = new Set(entries.filter((entry) => Boolean(entry.completed)).map((entry) => entry.date));
  const streaks = calculateStreaks(days, eventDates);

  return {
    habitId: habit.id,
    clientId: habit.client_id ?? `server-${habit.id}`,
    name: habit.name,
    isActive: Boolean(habit.is_active),
    trackedDays: trackedDates.size,
    eventDays: eventDates.size,
    trackingRate: days.length > 0 ? trackedDates.size / days.length : 0,
    eventRate: days.length > 0 ? eventDates.size / days.length : 0,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    lastEventDate: [...eventDates].sort().at(-1) ?? null,
    weekdays: weekdayPattern(days, eventDates)
  };
}

function buildCorrelations(
  items: HabitAnalysisItem[],
  days: string[],
  metricSeries: Record<HabitCorrelationMetric, Map<string, number>>
): HabitCorrelation[] {
  return items
    .flatMap((item) => buildItemCorrelations(item, days, metricSeries))
    .sort((left, right) => correlationScore(right) - correlationScore(left));
}

function buildItemCorrelations(
  item: HabitAnalysisItem,
  days: string[],
  metricSeries: Record<HabitCorrelationMetric, Map<string, number>>
) {
  const eventDates = new Set(itemEventDatesCache.get(item.clientId) ?? []);
  const result: HabitCorrelation[] = [];
  if (eventDates.size === 0) return result;

  for (const timing of ["sameDay", "nextDay"] as const) {
    for (const metric of METRICS) {
      const values = metricSeries[metric.id];
      const eventValues: number[] = [];
      const comparisonValues: number[] = [];

      for (const day of days) {
        const metricDate = timing === "nextDay" ? addDaysKey(day, 1) : day;
        const value = values.get(metricDate);
        if (value === undefined || value === null) continue;
        if (eventDates.has(day)) {
          eventValues.push(value);
        } else {
          comparisonValues.push(value);
        }
      }

      const eventAverage = average(eventValues);
      const comparisonAverage = average(comparisonValues);
      const hasEnough = eventValues.length >= MIN_EVENT_VALUES && comparisonValues.length >= MIN_COMPARISON_VALUES;
      const delta = hasEnough && eventAverage !== null && comparisonAverage !== null ? eventAverage - comparisonAverage : null;

      result.push({
        habitClientId: item.clientId,
        habitName: item.name,
        metric: metric.id,
        metricLabel: metric.label,
        unit: metric.unit,
        timing,
        eventDays: eventValues.length,
        comparisonDays: comparisonValues.length,
        eventAverage: hasEnough ? eventAverage : null,
        comparisonAverage: hasEnough ? comparisonAverage : null,
        delta,
        summary:
          hasEnough && delta !== null
            ? `${timing === "nextDay" ? "Am Folgetag" : "Am selben Tag"} von ${item.name}: ${formatSigned(delta, metric.unit)} vs. Vergleichstage.`
            : `Zu wenig Daten für ${item.name} × ${metric.label}.`,
        quality: hasEnough ? "ok" : "insufficient"
      });
    }
  }

  return result.filter((correlation) => correlation.quality === "ok");
}

const itemEventDatesCache = new Map<string, string[]>();

function groupEntries(entries: EntryRow[]) {
  itemEventDatesCache.clear();
  const groups = new Map<number, EntryRow[]>();
  const eventsByClientId = new Map<string, Set<string>>();
  for (const entry of entries) {
    const current = groups.get(entry.habit_id) ?? [];
    current.push(entry);
    groups.set(entry.habit_id, current);
    if (entry.completed && entry.habit_client_id) {
      const events = eventsByClientId.get(entry.habit_client_id) ?? new Set<string>();
      events.add(entry.date);
      eventsByClientId.set(entry.habit_client_id, events);
    }
  }
  for (const [clientId, dates] of eventsByClientId) {
    itemEventDatesCache.set(clientId, [...dates]);
  }
  return groups;
}

function buildMetricSeries(db: AppDatabase, start: Date, endExclusive: Date): Record<HabitCorrelationMetric, Map<string, number>> {
  return {
    resting_hr: rowsToMap(queryDailySampleAvg(db, "restingHeartRate", start, endExclusive)),
    hrv: rowsToMap(queryDailySampleAvg(db, "heartRateVariabilitySDNN", start, endExclusive)),
    sleep: rowsToMap(sleepSeries(db, start, addDays(endExclusive, -1))),
    steps: rowsToMap(queryDailySampleSum(db, "stepCount", start, endExclusive)),
    active_energy: rowsToMap(queryDailySampleSum(db, "activeEnergyBurned", start, endExclusive)),
    running_distance: rowsToMap(queryDailyWorkoutDistance(db, start, endExclusive))
  };
}

function queryDailySampleAvg(db: AppDatabase, type: string, start: Date, endExclusive: Date) {
  return db
    .prepare(
      `SELECT date(start_at) AS date, AVG(value) AS value
       FROM health_samples
       WHERE type = ?
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(type, toIso(start), toIso(endExclusive)) as PointRow[];
}

function queryDailySampleSum(db: AppDatabase, type: string, start: Date, endExclusive: Date) {
  return db
    .prepare(
      `SELECT date(start_at) AS date, SUM(value) AS value
       FROM health_samples
       WHERE type = ?
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(type, toIso(start), toIso(endExclusive)) as PointRow[];
}

function queryDailyWorkoutDistance(db: AppDatabase, start: Date, endExclusive: Date) {
  return db
    .prepare(
      `SELECT date(start_at) AS date, SUM(COALESCE(distance_m, 0)) / 1000.0 AS value
       FROM workouts
       WHERE lower(activity_type) LIKE '%running%'
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(toIso(start), toIso(endExclusive)) as PointRow[];
}

function sleepSeries(db: AppDatabase, start: Date, end: Date): PointRow[] {
  const points: PointRow[] = [];
  for (const date of dateRange(start, end)) {
    const day = new Date(`${date}T00:00:00.000Z`);
    points.push({ date, value: getSleepHours(db, addHours(day, -6), addHours(day, 14)) });
  }
  return points;
}

function getSleepHours(db: AppDatabase, start: Date, end: Date) {
  const rows = db
    .prepare(
      `SELECT start_at, end_at FROM health_samples
       WHERE type = 'sleepAnalysis'
         AND value IN (1, 3, 4, 5)
         AND start_at < ?
         AND end_at > ?
       ORDER BY start_at`
    )
    .all(toIso(end), toIso(start)) as { start_at: string; end_at: string }[];
  if (rows.length === 0) return null;

  const windowStart = start.getTime();
  const windowEnd = end.getTime();
  const intervals = rows
    .map((row) => ({
      start: Math.max(new Date(row.start_at).getTime(), windowStart),
      end: Math.min(new Date(row.end_at).getTime(), windowEnd)
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  const merged = intervals.reduce<{ start: number; end: number }[]>((acc, interval) => {
    const current = acc.at(-1);
    if (!current || interval.start > current.end) {
      acc.push({ ...interval });
    } else {
      current.end = Math.max(current.end, interval.end);
    }
    return acc;
  }, []);
  return merged.reduce((sum, interval) => sum + interval.end - interval.start, 0) / (60 * 60 * 1000);
}

function calculateStreaks(days: string[], eventDates: Set<string>) {
  let current = 0;
  let longest = 0;
  let running = 0;
  for (const day of days) {
    if (eventDates.has(day)) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (!eventDates.has(days[index])) break;
    current += 1;
  }
  return { current, longest };
}

function weekdayPattern(days: string[], eventDates: Set<string>) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const matchingDays = days.filter((day) => new Date(`${day}T12:00:00`).getDay() === weekday);
    const eventDays = matchingDays.filter((day) => eventDates.has(day)).length;
    return {
      weekday,
      label: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][weekday],
      eventDays,
      totalDays: matchingDays.length,
      eventRate: matchingDays.length > 0 ? eventDays / matchingDays.length : 0
    };
  });
}

function dateRange(start: Date, end: Date) {
  const days: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(toDateKey(cursor));
  }
  return days;
}

function rowsToMap(rows: PointRow[]) {
  return new Map(rows.filter((row) => row.value !== null).map((row) => [row.date, Number(row.value)]));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSigned(value: number, unit: string) {
  const formatted = Math.abs(value) >= 100 ? Math.round(value).toLocaleString("de-DE") : value.toFixed(1);
  return `${value >= 0 ? "+" : "-"}${formatted.replace("-", "")}${unit ? ` ${unit}` : ""}`;
}

function correlationScore(correlation: HabitCorrelation) {
  if (correlation.delta === null) return 0;
  const scale: Record<HabitCorrelationMetric, number> = {
    resting_hr: 1,
    hrv: 5,
    sleep: 0.25,
    steps: 1000,
    active_energy: 100,
    running_distance: 1
  };
  return Math.abs(correlation.delta) / scale[correlation.metric];
}

function addDaysKey(date: string, days: number) {
  return toDateKey(addDays(new Date(`${date}T00:00:00.000Z`), days));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIso(date: Date) {
  return date.toISOString();
}
