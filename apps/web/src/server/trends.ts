import type { TrendCard, TrendDashboard, TrendPoint } from "../shared/types";
import type { AppDatabase } from "./db";
import { getRestingHeartRateCoach } from "./restingHeartRate";

type RangeDays = TrendDashboard["rangeDays"];
type NumericRow = { value: number | null };
type PointRow = { date: string; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTrendDashboard(db: AppDatabase, rangeDays: RangeDays = 90, date = toDateKey(new Date())): TrendDashboard {
  const end = new Date(`${date}T00:00:00.000Z`);
  const start = addDays(end, -rangeDays + 1);
  const previousStart = addDays(start, -rangeDays);
  const previousEnd = addDays(start, -1);

  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    cards: [
      runningCard(db, start, end, previousStart, previousEnd),
      vo2MaxCard(db, start, end, previousStart, previousEnd),
      restingHrCard(db, start, end, previousStart, previousEnd, date),
      hrvCard(db, start, end, previousStart, previousEnd),
      sleepCard(db, start, end, previousStart, previousEnd),
      activityCard(db, start, end, previousStart, previousEnd)
    ]
  };
}

function runningCard(db: AppDatabase, start: Date, end: Date, previousStart: Date, previousEnd: Date): TrendCard {
  const points = dailySeries(
    start,
    end,
    queryDailyWorkoutDistance(db, start, end),
    0
  );
  const total = sumPoints(points);
  const previousTotal = sumPoints(dailySeries(previousStart, previousEnd, queryDailyWorkoutDistance(db, previousStart, previousEnd), 0));
  const runCount = countRunningWorkouts(db, start, end);

  return {
    id: "running",
    title: "Laufvolumen",
    value: `${total.toFixed(1)} km`,
    detail: `${runCount} Läufe im Zeitraum`,
    deltaLabel: compareLabel(total, previousTotal, "km", "sum"),
    direction: "up_good",
    status: total >= previousTotal ? "good" : "neutral",
    points
  };
}

function vo2MaxCard(db: AppDatabase, start: Date, end: Date, previousStart: Date, previousEnd: Date): TrendCard {
  const points = dailySeries(start, end, queryDailySampleAvg(db, "vo2Max", start, end), null);
  const latest = latestNonNull(points);
  const currentAvg = avgPoints(points);
  const previousAvg = avgPoints(dailySeries(previousStart, previousEnd, queryDailySampleAvg(db, "vo2Max", previousStart, previousEnd), null));

  return {
    id: "vo2max",
    title: "VO2max",
    value: latest === null ? "keine Daten" : latest.toFixed(1),
    detail: currentAvg === null ? "Kein Durchschnitt verfügbar" : `Ø ${currentAvg.toFixed(1)} ml/kg/min`,
    deltaLabel: compareLabel(currentAvg, previousAvg, "", "avg"),
    direction: "up_good",
    status: currentAvg !== null && previousAvg !== null && currentAvg >= previousAvg ? "good" : "neutral",
    points
  };
}

function restingHrCard(
  db: AppDatabase,
  start: Date,
  end: Date,
  previousStart: Date,
  previousEnd: Date,
  date: string
): TrendCard {
  const points = dailySeries(start, end, queryDailySampleAvg(db, "restingHeartRate", start, end), null);
  const currentAvg = avgPoints(points);
  const previousAvg = avgPoints(
    dailySeries(previousStart, previousEnd, queryDailySampleAvg(db, "restingHeartRate", previousStart, previousEnd), null)
  );
  const coach = getRestingHeartRateCoach(db, date);

  return {
    id: "resting_hr",
    title: "Ruhepuls",
    value: coach.sevenDayAverage === null ? "—" : `${Math.round(coach.sevenDayAverage)} bpm`,
    detail:
      coach.baseline28DayAverage === null
        ? `7-Tage-Schnitt: ${coach.sevenDaySampleDays}/7 Messtage`
        : `7 Tage vs. vorherige 28 Tage: ${Math.round(coach.baseline28DayAverage)} bpm`,
    interpretation: coach.statusLabel,
    deltaLabel: compareLabel(currentAvg, previousAvg, "bpm", "avg"),
    direction: "down_good",
    status:
      coach.status === "elevated" || coach.status === "high"
        ? "watch"
        : coach.status === "best_phase" || coach.status === "recovered"
          ? "good"
          : "neutral",
    points
  };
}

function hrvCard(db: AppDatabase, start: Date, end: Date, previousStart: Date, previousEnd: Date): TrendCard {
  const points = dailySeries(start, end, queryDailySampleAvg(db, "heartRateVariabilitySDNN", start, end), null);
  const currentAvg = avgPoints(points);
  const previousAvg = avgPoints(
    dailySeries(previousStart, previousEnd, queryDailySampleAvg(db, "heartRateVariabilitySDNN", previousStart, previousEnd), null)
  );

  return {
    id: "hrv",
    title: "HRV",
    value: currentAvg === null ? "keine Daten" : `${Math.round(currentAvg)} ms`,
    detail: "Trend statt Einzeltag bewerten",
    deltaLabel: compareLabel(currentAvg, previousAvg, "ms", "avg"),
    direction: "up_good",
    status: currentAvg !== null && previousAvg !== null && currentAvg >= previousAvg ? "good" : "neutral",
    points
  };
}

function sleepCard(db: AppDatabase, start: Date, end: Date, previousStart: Date, previousEnd: Date): TrendCard {
  const points = sleepSeries(db, start, end);
  const currentAvg = avgPoints(points);
  const previousAvg = avgPoints(sleepSeries(db, previousStart, previousEnd));

  return {
    id: "sleep",
    title: "Schlaf",
    value: currentAvg === null ? "keine Daten" : `${currentAvg.toFixed(1)} h`,
    detail: "Ø Schlaf pro Nacht",
    deltaLabel: compareLabel(currentAvg, previousAvg, "h", "avg"),
    direction: "neutral",
    status: currentAvg !== null && currentAvg >= 7 ? "good" : "watch",
    points
  };
}

function activityCard(db: AppDatabase, start: Date, end: Date, previousStart: Date, previousEnd: Date): TrendCard {
  const points = dailySeries(start, end, queryDailySampleSum(db, "stepCount", start, end), 0);
  const currentAvg = avgPoints(points);
  const previousAvg = avgPoints(dailySeries(previousStart, previousEnd, queryDailySampleSum(db, "stepCount", previousStart, previousEnd), 0));
  const activeKcalAvg = avgPoints(dailySeries(start, end, queryDailySampleSum(db, "activeEnergyBurned", start, end), 0));

  return {
    id: "activity",
    title: "Aktivität",
    value: currentAvg === null ? "keine Daten" : `${Math.round(currentAvg).toLocaleString("de-DE")} Schritte`,
    detail: activeKcalAvg === null ? "Ø pro Tag" : `Ø ${Math.round(activeKcalAvg)} aktive kcal/Tag`,
    deltaLabel: compareLabel(currentAvg, previousAvg, "Schritte", "avg"),
    direction: "up_good",
    status: currentAvg !== null && currentAvg >= 8000 ? "good" : "neutral",
    points
  };
}

function queryDailyWorkoutDistance(db: AppDatabase, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT date(start_at) AS date, SUM(COALESCE(distance_m, 0)) / 1000.0 AS value
       FROM workouts
       WHERE lower(activity_type) LIKE '%running%'
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(toIso(start), toIso(addDays(end, 1))) as PointRow[];
}

function queryDailySampleAvg(db: AppDatabase, type: string, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT date(start_at) AS date, AVG(value) AS value
       FROM health_samples
       WHERE type = ?
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(type, toIso(start), toIso(addDays(end, 1))) as PointRow[];
}

function queryDailySampleSum(db: AppDatabase, type: string, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT date(start_at) AS date, SUM(value) AS value
       FROM health_samples
       WHERE type = ?
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(type, toIso(start), toIso(addDays(end, 1))) as PointRow[];
}

function countRunningWorkouts(db: AppDatabase, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS value
       FROM workouts
       WHERE lower(activity_type) LIKE '%running%'
         AND start_at >= ?
         AND start_at < ?`
    )
    .get(toIso(start), toIso(addDays(end, 1))) as NumericRow;
  return row.value ?? 0;
}

function sleepSeries(db: AppDatabase, start: Date, end: Date): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const window = {
      start: new Date(cursor.getTime() - 6 * 60 * 60 * 1000),
      end: new Date(cursor.getTime() + 14 * 60 * 60 * 1000)
    };
    points.push({
      date: toDateKey(cursor),
      value: getSleepHours(db, window.start, window.end)
    });
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
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) return null;

  const merged = intervals.reduce<{ start: number; end: number }[]>((acc, interval) => {
    const current = acc.at(-1);
    if (!current || interval.start > current.end) {
      acc.push({ ...interval });
      return acc;
    }
    current.end = Math.max(current.end, interval.end);
    return acc;
  }, []);

  return merged.reduce((sum, interval) => sum + interval.end - interval.start, 0) / (60 * 60 * 1000);
}

function dailySeries(start: Date, end: Date, rows: PointRow[], fallback: number | null): TrendPoint[] {
  const values = new Map(rows.map((row) => [row.date, row.value]));
  const points: TrendPoint[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const date = toDateKey(cursor);
    points.push({
      date,
      value: values.get(date) ?? fallback
    });
  }
  return points;
}

function sumPoints(points: TrendPoint[]) {
  return points.reduce((sum, point) => sum + (point.value ?? 0), 0);
}

function avgPoints(points: TrendPoint[]) {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestNonNull(points: TrendPoint[]) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].value !== null) return points[index].value;
  }
  return null;
}

function compareLabel(current: number | null, previous: number | null, unit: string, mode: "avg" | "sum") {
  if (current === null || previous === null) return "kein Vergleich";
  const diff = current - previous;
  const sign = diff > 0 ? "+" : "";
  const abs = Math.abs(diff);
  const formatted = abs >= 100 ? Math.round(diff).toLocaleString("de-DE") : abs >= 10 ? diff.toFixed(1) : diff.toFixed(2);
  const suffix = unit ? ` ${unit}` : "";
  return `${sign}${formatted}${suffix} vs. Vorperiode${mode === "avg" ? " Ø" : ""}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toIso(date: Date) {
  return date.toISOString();
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
