import type { HeartRateZone, HeartRateZones } from "../shared/types";
import type { AppDatabase } from "./db";

type NumberRow = { value: number | null };
type ProfileRow = { age: number | null };
type RunningHeartRateRow = {
  workout_id: number;
  workout_start: string;
  distance_m: number | null;
  duration_seconds: number | null;
  sample_at: string;
  value: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getHeartRateZones(db: AppDatabase, date: string): HeartRateZones {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const endExclusive = addDays(dayStart, 1);
  const last28 = addDays(dayStart, -27);
  const last90 = addDays(dayStart, -89);
  const last365 = addDays(dayStart, -364);

  const restingHeartRate = avgSample(db, "restingHeartRate", last28, endExclusive)
    ?? avgSample(db, "restingHeartRate", last90, endExclusive);
  const rows = queryRunningHeartRateRows(db, last365, endExclusive);
  const running = summarizeRunningHeartRate(rows);
  const age = getProfileAge(db) ?? 28;
  const estimatedMaxHeartRate = estimateMaxHeartRate(running.observedPeak, running.sustainedPeak60s, age);
  const roundedResting = restingHeartRate === null ? null : Math.round(restingHeartRate);
  const reserve =
    roundedResting === null || estimatedMaxHeartRate === null ? null : estimatedMaxHeartRate - roundedResting;
  const zones = buildZones(roundedResting, estimatedMaxHeartRate, rows.map((row) => row.value));
  const confidence = confidenceFor(running.runCount, running.sampleCount, running.sustainedPeak60s);

  return {
    method: "heart_rate_reserve",
    restingHeartRate: roundedResting,
    estimatedMaxHeartRate,
    heartRateReserve: reserve,
    observedPeak: running.observedPeak,
    sustainedPeak60s: running.sustainedPeak60s,
    runCount: running.runCount,
    sampleCount: running.sampleCount,
    confidence,
    summary: summaryFor({
      restingHeartRate: roundedResting,
      estimatedMaxHeartRate,
      sustainedPeak60s: running.sustainedPeak60s,
      runCount: running.runCount,
      confidence
    }),
    zones
  };
}

function queryRunningHeartRateRows(db: AppDatabase, start: Date, end: Date) {
  return db
    .prepare(
      `SELECT
         w.id AS workout_id,
         w.start_at AS workout_start,
         w.distance_m,
         w.duration_seconds,
         h.start_at AS sample_at,
         h.value
       FROM workouts w
       JOIN health_samples h
         ON h.type = 'heartRate'
        AND h.start_at >= w.start_at
        AND h.start_at <= w.end_at
       WHERE lower(w.activity_type) LIKE '%running%'
         AND COALESCE(w.distance_m, 0) > 1000
         AND w.start_at >= ?
         AND w.start_at < ?
       ORDER BY w.start_at, h.start_at`
    )
    .all(toIso(start), toIso(end)) as RunningHeartRateRow[];
}

function summarizeRunningHeartRate(rows: RunningHeartRateRow[]) {
  const groups = new Map<number, RunningHeartRateRow[]>();
  for (const row of rows) {
    const current = groups.get(row.workout_id) ?? [];
    current.push(row);
    groups.set(row.workout_id, current);
  }

  let observedPeak: number | null = null;
  let sustainedPeak60s: number | null = null;
  let runCount = 0;
  let sampleCount = 0;

  for (const samples of groups.values()) {
    if (samples.length < 10) continue;
    runCount += 1;
    sampleCount += samples.length;
    for (const sample of samples) {
      observedPeak = observedPeak === null ? sample.value : Math.max(observedPeak, sample.value);
    }
    const workoutPeak = maxWindowAverage(samples, 60);
    if (workoutPeak !== null) {
      sustainedPeak60s = sustainedPeak60s === null ? workoutPeak : Math.max(sustainedPeak60s, workoutPeak);
    }
  }

  return {
    observedPeak: observedPeak === null ? null : Math.round(observedPeak),
    sustainedPeak60s: sustainedPeak60s === null ? null : Math.round(sustainedPeak60s),
    runCount,
    sampleCount
  };
}

function maxWindowAverage(samples: RunningHeartRateRow[], seconds: number) {
  let left = 0;
  let sum = 0;
  let best: number | null = null;
  const minimumSamples = 10;

  for (let right = 0; right < samples.length; right += 1) {
    sum += samples[right].value;
    const rightTime = new Date(samples[right].sample_at).getTime();
    while (rightTime - new Date(samples[left].sample_at).getTime() > seconds * 1000) {
      sum -= samples[left].value;
      left += 1;
    }
    const count = right - left + 1;
    if (count >= minimumSamples) {
      const average = sum / count;
      best = best === null ? average : Math.max(best, average);
    }
  }

  return best;
}

function estimateMaxHeartRate(observedPeak: number | null, sustainedPeak60s: number | null, age: number) {
  const formulaFallback = Math.round(208 - 0.7 * age);
  if (observedPeak === null && sustainedPeak60s === null) return formulaFallback;
  if (sustainedPeak60s === null) return clamp(observedPeak ?? formulaFallback, formulaFallback - 8, 205);

  // Sustained peaks are more trustworthy than one-second optical spikes; keep a small anaerobic headroom.
  const sustainedEstimate = sustainedPeak60s + 17;
  const observedEstimate = observedPeak === null ? sustainedEstimate : observedPeak - 2;
  return clamp(Math.round(Math.max(sustainedEstimate, observedEstimate, formulaFallback)), formulaFallback, 205);
}

function buildZones(restingHeartRate: number | null, estimatedMaxHeartRate: number | null, samples: number[]): HeartRateZone[] {
  if (restingHeartRate === null || estimatedMaxHeartRate === null || estimatedMaxHeartRate <= restingHeartRate) {
    return zoneTemplates().map((zone) => ({ ...zone, low: null, high: null, sampleShare: null }));
  }

  const reserve = estimatedMaxHeartRate - restingHeartRate;
  const starts = [0.5, 0.6, 0.7, 0.8, 0.9].map((factor) => Math.round(restingHeartRate + reserve * factor));
  const ranges = [
    { low: null, high: starts[0] - 1 },
    { low: starts[0], high: starts[1] - 1 },
    { low: starts[1], high: starts[2] - 1 },
    { low: starts[2], high: starts[3] - 1 },
    { low: starts[3], high: starts[4] - 1 },
    { low: starts[4], high: estimatedMaxHeartRate }
  ];

  return zoneTemplates().map((zone, index) => ({
    ...zone,
    ...ranges[index],
    sampleShare: samples.length === 0 ? null : shareForRange(samples, ranges[index].low, ranges[index].high)
  }));
}

function zoneTemplates(): Omit<HeartRateZone, "low" | "high" | "sampleShare">[] {
  return [
    {
      id: "warmup",
      label: "Warm-up",
      description: "Gehen, Einlaufen, sehr lockere Bewegung.",
      guidance: "Ideal für Waden-Aufbau, Cooldown und aktive Erholung."
    },
    {
      id: "recovery",
      label: "Z1 Recovery",
      description: "Locker, nasal/ruhig möglich, kaum Druck.",
      guidance: "Regeneration oder sehr vorsichtige Läufe."
    },
    {
      id: "aerobic",
      label: "Z2 Aerob",
      description: "Dein primärer Easy-Run-Bereich.",
      guidance: "Hier solltest du lange kontrolliert laufen können."
    },
    {
      id: "steady",
      label: "Z3 Steady",
      description: "Zügig und noch kontrolliert, aber nicht mehr wirklich easy.",
      guidance: "Für Dauerläufe mit Druck sparsam einsetzen."
    },
    {
      id: "threshold",
      label: "Z4 Schwelle",
      description: "Hart, fokussiert, deutlich belastend.",
      guidance: "Nur gezielt, nicht als Standard-Jogging."
    },
    {
      id: "vo2max",
      label: "Z5 VO2/Max",
      description: "Sehr hart bis maximal.",
      guidance: "Intervalle oder kurze Peaks."
    }
  ];
}

function shareForRange(samples: number[], low: number | null, high: number | null) {
  const count = samples.filter((value) => (low === null || value >= low) && (high === null || value <= high)).length;
  return Math.round((count / samples.length) * 1000) / 10;
}

function confidenceFor(runCount: number, sampleCount: number, sustainedPeak60s: number | null): HeartRateZones["confidence"] {
  if (runCount >= 20 && sampleCount >= 3000 && sustainedPeak60s !== null) return "high";
  if (runCount >= 5 && sampleCount >= 500) return "medium";
  return "low";
}

function summaryFor(input: {
  restingHeartRate: number | null;
  estimatedMaxHeartRate: number | null;
  sustainedPeak60s: number | null;
  runCount: number;
  confidence: HeartRateZones["confidence"];
}) {
  if (input.restingHeartRate === null || input.estimatedMaxHeartRate === null) {
    return "Noch zu wenig Daten für dynamische Herzfrequenz-Zonen.";
  }

  const quality =
    input.confidence === "high"
      ? "hoch"
      : input.confidence === "medium"
        ? "mittel"
        : "niedrig";
  const sustained = input.sustainedPeak60s === null ? "" : `, 60s-Peak ${input.sustainedPeak60s} bpm`;
  return `Dynamisch aus Ruhepuls ${input.restingHeartRate} bpm, geschätzter MaxHF ${input.estimatedMaxHeartRate} bpm und ${input.runCount} Läufen berechnet${sustained}. Vertrauen: ${quality}.`;
}

function avgSample(db: AppDatabase, type: string, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT AVG(value) AS value
       FROM health_samples
       WHERE type = ?
         AND start_at >= ?
         AND start_at < ?`
    )
    .get(type, toIso(start), toIso(end)) as NumberRow;
  return row.value;
}

function getProfileAge(db: AppDatabase) {
  const row = db.prepare(`SELECT age FROM profile WHERE id = 1`).get() as ProfileRow | undefined;
  return row?.age ?? null;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toIso(date: Date) {
  return date.toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
