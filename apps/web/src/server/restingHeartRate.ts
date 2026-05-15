import type { DailyCheckIn, RestingHeartRateCoach, TrendPoint } from "../shared/types";
import type { AppDatabase } from "./db";

type NumberRow = { value: number | null };
type PointRow = { date: string; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function getRestingHeartRateCoach(
  db: AppDatabase,
  date: string,
  checkIn: DailyCheckIn | null = null
): RestingHeartRateCoach {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const endExclusive = addDays(dayStart, 1);
  const sevenDayStart = addDays(dayStart, -6);
  const baselineStart = addDays(dayStart, -27);
  const ninetyDayStart = addDays(dayStart, -89);

  const points90 = dailyRestingHeartRateSeries(db, ninetyDayStart, dayStart);
  const points28 = points90.filter((point) => point.date >= toDateKey(baselineStart));
  const points7 = points90.filter((point) => point.date >= toDateKey(sevenDayStart));
  const latest = latestRestingHeartRate(db, ninetyDayStart, endExclusive);
  const sevenDayAverage = avgPoints(points7);
  const baseline28DayAverage = avgPoints(points28);
  const ninetyDayAverage = avgPoints(points90);
  const bestSevenDayAverage = bestRollingAverage(points90, 7, 4);
  const trend90DayDelta = deltaBetweenWindows(points90, 14);
  const deltaFromBaseline =
    sevenDayAverage === null || baseline28DayAverage === null ? null : sevenDayAverage - baseline28DayAverage;
  const deltaFromBest =
    sevenDayAverage === null || bestSevenDayAverage === null ? null : sevenDayAverage - bestSevenDayAverage;
  const normalZone =
    baseline28DayAverage === null
      ? null
      : { low: Math.round(baseline28DayAverage - 3), high: Math.round(baseline28DayAverage + 5) };

  const status = classifyStatus({
    sevenDayAverage,
    baseline28DayAverage,
    bestSevenDayAverage,
    deltaFromBaseline,
    trend90DayDelta
  });
  const drivers = buildDriverHints(checkIn, status, deltaFromBaseline);

  return {
    status,
    statusLabel: labelForStatus(status),
    latest,
    sevenDayAverage,
    baseline28DayAverage,
    ninetyDayAverage,
    bestSevenDayAverage,
    deltaFromBaseline,
    deltaFromBest,
    trend90DayDelta,
    normalZone,
    summary: summaryForStatus(status, {
      sevenDayAverage,
      baseline28DayAverage,
      deltaFromBaseline,
      bestSevenDayAverage,
      normalZone
    }),
    actions: actionsForStatus(status, checkIn),
    drivers
  };
}

export function dailyRestingHeartRateSeries(db: AppDatabase, start: Date, end: Date): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date(start_at) AS date, AVG(value) AS value
       FROM health_samples
       WHERE type = 'restingHeartRate'
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(toIso(start), toIso(addDays(end, 1))) as PointRow[];

  const values = new Map(rows.map((row) => [row.date, row.value]));
  const points: TrendPoint[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const date = toDateKey(cursor);
    points.push({ date, value: values.get(date) ?? null });
  }
  return points;
}

export function avgPoints(points: TrendPoint[]) {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function classifyStatus(input: {
  sevenDayAverage: number | null;
  baseline28DayAverage: number | null;
  bestSevenDayAverage: number | null;
  deltaFromBaseline: number | null;
  trend90DayDelta: number | null;
}): RestingHeartRateCoach["status"] {
  if (input.sevenDayAverage === null || input.baseline28DayAverage === null) return "missing";
  const deltaFromBaseline = input.deltaFromBaseline ?? 0;
  if (deltaFromBaseline >= 7.5) return "high";
  if (deltaFromBaseline >= 4.5) return "elevated";
  if (
    input.bestSevenDayAverage !== null &&
    input.sevenDayAverage <= input.bestSevenDayAverage + 1.5 &&
    deltaFromBaseline <= 0
  ) {
    return "best_phase";
  }
  if (input.trend90DayDelta !== null && input.trend90DayDelta <= -2 && deltaFromBaseline <= 1) return "recovered";
  return "stable";
}

function latestRestingHeartRate(db: AppDatabase, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT value FROM health_samples
       WHERE type = 'restingHeartRate'
         AND start_at >= ?
         AND start_at < ?
       ORDER BY start_at DESC
       LIMIT 1`
    )
    .get(toIso(start), toIso(end)) as NumberRow | undefined;
  return row?.value ?? null;
}

function bestRollingAverage(points: TrendPoint[], windowDays: number, minimumValues: number) {
  let best: number | null = null;
  for (let index = 0; index <= points.length - windowDays; index += 1) {
    const average = avgPoints(points.slice(index, index + windowDays));
    const values = points.slice(index, index + windowDays).filter((point) => point.value !== null).length;
    if (average === null || values < minimumValues) continue;
    best = best === null ? average : Math.min(best, average);
  }
  return best;
}

function deltaBetweenWindows(points: TrendPoint[], windowDays: number) {
  const first = avgPoints(points.slice(0, windowDays));
  const last = avgPoints(points.slice(-windowDays));
  if (first === null || last === null) return null;
  return last - first;
}

function labelForStatus(status: RestingHeartRateCoach["status"]) {
  const labels: Record<RestingHeartRateCoach["status"], string> = {
    missing: "Zu wenig Daten",
    best_phase: "Neue Bestphase",
    recovered: "Erholt",
    stable: "Stabil",
    elevated: "Erhöht",
    high: "Auffällig erhöht"
  };
  return labels[status];
}

function summaryForStatus(
  status: RestingHeartRateCoach["status"],
  input: {
    sevenDayAverage: number | null;
    baseline28DayAverage: number | null;
    deltaFromBaseline: number | null;
    bestSevenDayAverage: number | null;
    normalZone: RestingHeartRateCoach["normalZone"];
  }
) {
  if (status === "missing") {
    return "Noch zu wenig Ruhepuls-Daten für eine belastbare persönliche Einordnung.";
  }

  const seven = Math.round(input.sevenDayAverage ?? 0);
  const baseline = Math.round(input.baseline28DayAverage ?? 0);
  const delta = input.deltaFromBaseline === null ? 0 : Math.round(input.deltaFromBaseline);
  const zone = input.normalZone ? `${input.normalZone.low}-${input.normalZone.high} bpm` : "deiner Normalzone";

  if (status === "high") {
    return `Dein 7-Tage-Ruhepuls liegt bei ${seven} bpm und damit ca. +${delta} bpm über deiner 28-Tage-Baseline (${baseline} bpm). Heute defensiv steuern.`;
  }
  if (status === "elevated") {
    return `Dein Ruhepuls ist erhöht: ${seven} bpm im 7-Tage-Schnitt gegenüber ${baseline} bpm Baseline. Regeneration und Schlaf sind heute die besten Hebel.`;
  }
  if (status === "best_phase") {
    return `Sehr stark: Dein 7-Tage-Ruhepuls liegt mit ${seven} bpm nahe deiner besten Phase und innerhalb der persönlichen Normalzone (${zone}).`;
  }
  if (status === "recovered") {
    return `Dein Ruhepuls wirkt erholt: ${seven} bpm im 7-Tage-Schnitt, Baseline ${baseline} bpm. Intensität bleibt optional, nicht erzwungen.`;
  }
  return `Dein Ruhepuls ist stabil: ${seven} bpm im 7-Tage-Schnitt bei einer Baseline von ${baseline} bpm. Normalzone: ${zone}.`;
}

function actionsForStatus(status: RestingHeartRateCoach["status"], checkIn: DailyCheckIn | null) {
  const base = {
    high: [
      "Heute kein hartes Lauftraining: 30-45 Minuten Spaziergang, Mobility oder sehr lockere Zone 2.",
      "Schlafdruck senken: Koffein früh cutten, Abendessen leicht halten und Schlafenszeit schützen.",
      "Rauch-Trigger heute sichtbar machen und mindestens eine Zigarette bewusst verschieben oder streichen."
    ],
    elevated: [
      "Heute locker bleiben: Zone 2 oder Mobility vor Intensität.",
      "Hydration, Elektrolyte und frühes Koffein-Fenster als Ruhepuls-Hebel setzen.",
      "Wenn du läufst, danach kurz Atemgefühl, Wade/Knie und Ruhepuls-Kontext notieren."
    ],
    stable: [
      "Moderates Training ist ok, aber nicht in einen Bestzeit-Versuch kippen.",
      "Den stabilen Bereich schützen: Schlaf, Hydration und Nikotinmenge heute sauber tracken.",
      "Nach Belastung 5 Minuten Cooldown plus kurze Notiz, was den Puls morgen beeinflussen könnte."
    ],
    recovered: [
      "Du kannst trainieren, starte aber bewusst ruhig und steigere erst nach gutem Körpergefühl.",
      "Eine lockere Ausdauereinheit zahlt heute gut auf langfristig niedrigeren Ruhepuls ein.",
      "Den Erholungstag nicht verspielen: Schlafenszeit und Koffein-Fenster stabil halten."
    ],
    best_phase: [
      "Bestphase schützen: keine unnötig harte Einheit, wenn Schlaf oder Beine nicht mitziehen.",
      "Lockere Ausdauer, gute Hydration und frühes Runterfahren am Abend priorisieren.",
      "Notiere, welche Gewohnheiten diese gute Phase wahrscheinlich ermöglicht haben."
    ],
    missing: [
      "Apple Watch nachts tragen und morgens synchronisieren, damit der Ruhepuls-Coach belastbarer wird.",
      "Heute subjektiven Kontext im Check-in erfassen: Schlaf, Energie, Zigaretten und Schmerzen."
    ]
  } satisfies Record<RestingHeartRateCoach["status"], string[]>;

  const actions = [...base[status]];
  if (checkIn?.cigarettes && checkIn.cigarettes > 0 && status !== "missing") {
    actions.push("Zigarettenmenge heute als eigenen Ruhepuls-Hebel behandeln: klein reduzieren statt perfekt sein.");
  }
  if ((checkIn?.soreness ?? 0) >= 4) {
    actions.push("Muskelmüdigkeit ist erhöht: zusätzliche Intensität nur bei sehr gutem Körpergefühl.");
  }
  return [...new Set(actions)].slice(0, 4);
}

function buildDriverHints(
  checkIn: DailyCheckIn | null,
  status: RestingHeartRateCoach["status"],
  deltaFromBaseline: number | null
) {
  const hints: string[] = [];
  if (deltaFromBaseline !== null) {
    const rounded = Math.round(deltaFromBaseline);
    if (rounded > 0) hints.push(`+${rounded} bpm gegenüber deiner 28-Tage-Baseline`);
    if (rounded < 0) hints.push(`${rounded} bpm unter deiner 28-Tage-Baseline`);
  }
  if (checkIn?.sleepQuality && checkIn.sleepQuality <= 2) hints.push("Check-in: Schlafqualität niedrig");
  if (checkIn?.perceivedRecovery && checkIn.perceivedRecovery <= 2) hints.push("Check-in: Erholung niedrig");
  if ((checkIn?.soreness ?? 0) >= 4) hints.push("Check-in: Muskelmüdigkeit erhöht");
  if ((checkIn?.cigarettes ?? 0) > 0) hints.push(`Check-in: ${checkIn?.cigarettes} Zigarette(n)`);
  if (checkIn?.painAreas.length) hints.push(`Check-in: ${checkIn.painAreas.join(", ")}`);
  if (hints.length === 0 && (status === "elevated" || status === "high")) {
    hints.push("Mögliche Treiber: Schlafdefizit, Stress, Infekt, Alkohol/Nikotin oder hohe Belastung");
  }
  if (hints.length === 0) hints.push("Keine auffälligen Check-in-Treiber erfasst");
  return hints.slice(0, 4);
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
