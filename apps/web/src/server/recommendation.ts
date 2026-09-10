import type { AppDatabase } from "./db";
import { getDailyCheckIn, getHabitDay } from "./db";
import type { AiRecommendation, DashboardMetric, DashboardToday } from "../shared/types";
import { getHeartRateZones } from "./heartRateZones";
import { getRestingHeartRateCoach } from "./restingHeartRate";

type NumberRow = { value: number | null };
type ProfileEnergyRow = {
  age: number;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  nutrition_goal: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTodayDashboard(db: AppDatabase, date = toDateKey(new Date())): DashboardToday {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const sevenDaysAgo = new Date(dayStart.getTime() - 7 * DAY_MS);
  const fourteenDaysAgo = new Date(dayStart.getTime() - 14 * DAY_MS);
  const sleepWindow = getLastNightWindow(dayStart);

  const checkIn = getDailyCheckIn(db, date);
  const habits = getHabitDay(db, date);
  const restingHeartRateCoach = getRestingHeartRateCoach(db, date, checkIn);
  const heartRateZones = getHeartRateZones(db, date);
  const sleepHours = getSleepHours(db, sleepWindow.start, sleepWindow.end);
  const stepsToday = sumSamples(db, "stepCount", dayStart, dayEnd);
  const activeEnergyToday = sumSamples(db, "activeEnergyBurned", dayStart, dayEnd);
  const restingHrLatest = restingHeartRateCoach.latest;
  const restingHrBaseline = restingHeartRateCoach.baseline28DayAverage;
  const hrvLatest = latestSample(db, "heartRateVariabilitySDNN", fourteenDaysAgo, dayEnd);
  const hrvBaseline = avgSamples(db, "heartRateVariabilitySDNN", fourteenDaysAgo, dayEnd);
  const runLoad7 = runDistance(db, sevenDaysAgo, dayEnd);
  const runLoadPrev7 = runDistance(db, fourteenDaysAgo, sevenDaysAgo);
  const runCount7 = runCount(db, sevenDaysAgo, dayEnd);
  const calorieTarget = getCalorieTarget(db, date);

  const riskFlags: string[] = [];
  const reasons: string[] = [];
  const actions: string[] = [];
  let readinessScore = 82;

  if (sleepHours !== null && sleepHours < 6) {
    readinessScore -= 18;
    riskFlags.push("Kurzer Schlaf");
    reasons.push(`Letzte Nacht waren nur ca. ${sleepHours.toFixed(1)} h Schlaf sichtbar.`);
  }

  if (restingHeartRateCoach.status === "high") {
    readinessScore -= 18;
    riskFlags.push("Ruhepuls erhöht");
    reasons.push(restingHeartRateCoach.summary);
  } else if (restingHeartRateCoach.status === "elevated") {
    readinessScore -= 10;
    riskFlags.push("Ruhepuls erhöht");
    reasons.push(restingHeartRateCoach.summary);
  } else if (
    restingHeartRateCoach.status === "best_phase" ||
    restingHeartRateCoach.status === "recovered"
  ) {
    reasons.push(restingHeartRateCoach.summary);
  }

  if (hrvLatest !== null && hrvBaseline !== null && hrvLatest < hrvBaseline * 0.8) {
    readinessScore -= 12;
    riskFlags.push("HRV niedrig");
    reasons.push("Die HRV liegt merklich unter deinem aktuellen Basiswert.");
  }

  if (runLoad7 > 5000 && runLoadPrev7 > 0 && runLoad7 > runLoadPrev7 * 1.4) {
    readinessScore -= 12;
    riskFlags.push("Laufbelastung gestiegen");
    reasons.push("Die Laufdistanz der letzten 7 Tage ist stark gegenüber der Vorwoche gestiegen.");
  }

  const painText = [...(checkIn?.painAreas ?? []), checkIn?.notes ?? ""].join(" ").toLowerCase();
  const relevantPain = ["knie", "wade", "schienbein", "rechts"].some((term) => painText.includes(term));
  if (relevantPain || (checkIn?.soreness ?? 0) >= 5) {
    readinessScore -= 18;
    riskFlags.push("Beschwerden beobachten");
    reasons.push("Dein Check-in enthält Hinweise auf Knie/Wade/Schienbein oder hohe Muskelmüdigkeit.");
  }

  if (checkIn && checkIn.perceivedRecovery <= 2) {
    readinessScore -= 12;
    riskFlags.push("Subjektive Erholung niedrig");
    reasons.push("Deine subjektive Erholung ist heute niedrig.");
  }

  if (checkIn?.cigarettes && checkIn.cigarettes > 0) {
    actions.push("Zigaretten heute bewusst um eine kleine, realistische Einheit reduzieren.");
  }

  const missingNutrition = checkIn
    ? [
        !checkIn.proteinOk && "Protein absichern",
        !checkIn.creatineTaken && "Kreatin einnehmen",
        !checkIn.broccoliOrCruciferous && "Brokkoli/Blumenkohl einbauen",
        !checkIn.lentilsOrLegumes && "Linsen/Leguminosen einbauen",
        !checkIn.hydrationOk && "Hydration nachziehen"
      ].filter(Boolean)
    : [];

  if (habits.totalCount > 0 && habits.completionRate < 0.4) {
    riskFlags.push("Habits offen");
    actions.push("Heute einen kleinen Habit-Block schließen: Kreatin, Hydration oder Protein abhaken.");
  }

  if (missingNutrition.length >= 3) {
    readinessScore -= 5;
    riskFlags.push("Ernährungsanker offen");
    actions.push("Heute einen einfachen Ernährungsanker setzen: Protein plus eine Gemüse-/Linsen-Komponente.");
  }

  readinessScore = clamp(Math.round(readinessScore), 0, 100);

  const primaryAction = pickPrimaryAction({
    readinessScore,
    relevantPain,
    runLoad7,
    runLoadPrev7,
    runCount7,
    checkIn,
    missingNutritionCount: missingNutrition.length,
    restingHeartRateStatus: restingHeartRateCoach.status
  });

  actions.unshift(...defaultActions(primaryAction));
  if (restingHeartRateCoach.status === "high" || restingHeartRateCoach.status === "elevated") {
    actions.unshift(...restingHeartRateCoach.actions.slice(0, 2));
  }
  if (actions.length < 3) {
    actions.push("Kurz notieren, was heute gut funktioniert hat und was morgen leichter werden soll.");
  }
  if (reasons.length === 0) {
    reasons.push("Keine klaren Warnsignale aus den aktuell verfügbaren V1-Daten.");
  }

  return {
    date,
    readinessScore,
    primaryAction,
    headline: headlineFor(primaryAction, readinessScore),
    summary: summaryFor(primaryAction, readinessScore, riskFlags),
    riskFlags,
    reasons,
    actions: unique(actions).slice(0, 5),
    metrics: buildMetrics({
      sleepHours,
      stepsToday,
      activeEnergyToday,
      restingHrLatest,
      restingHrBaseline,
      hrvLatest,
      hrvBaseline,
      runLoad7,
      runLoadPrev7,
      runCount7,
      calorieTarget
    }),
    restingHeartRateCoach,
    heartRateZones,
    checkIn,
    habits,
    lastAiRecommendation: getLastAiRecommendation(db, date)
  };
}

export function createAiAnalysis(db: AppDatabase, date = toDateKey(new Date())): AiRecommendation {
  const dashboard = getTodayDashboard(db, date);
  const inputSnapshot = {
    date,
    readinessScore: dashboard.readinessScore,
    primaryAction: dashboard.primaryAction,
    riskFlags: dashboard.riskFlags,
    reasons: dashboard.reasons,
    restingHeartRateCoach: dashboard.restingHeartRateCoach,
    heartRateZones: dashboard.heartRateZones,
    checkIn: dashboard.checkIn,
    habits: dashboard.habits,
    metrics: dashboard.metrics
  };
  const recommendation = {
    headline: dashboard.headline,
    actions: dashboard.actions,
    notes: [
      "Diese V1-Auswertung nutzt minimierte lokale Zusammenfassungen statt Rohhistorie.",
      "Für medizinische Fragen oder anhaltende Schmerzen bitte ärztlich/physiotherapeutisch abklären."
    ]
  };

  const info = db
    .prepare(
      `INSERT INTO ai_recommendations (date, model, input_snapshot_json, recommendation_json)
       VALUES (?, ?, ?, ?)`
    )
    .run(date, "local-rules-v1", JSON.stringify(inputSnapshot), JSON.stringify(recommendation));

  return {
    id: Number(info.lastInsertRowid),
    date,
    model: "local-rules-v1",
    recommendation,
    createdAt: new Date().toISOString()
  };
}

function pickPrimaryAction(input: {
  readinessScore: number;
  relevantPain: boolean;
  runLoad7: number;
  runLoadPrev7: number;
  runCount7: number;
  checkIn: ReturnType<typeof getDailyCheckIn>;
  missingNutritionCount: number;
  restingHeartRateStatus: DashboardToday["restingHeartRateCoach"]["status"];
}): DashboardToday["primaryAction"] {
  if (input.relevantPain || input.readinessScore < 50) return "recovery";
  if (input.restingHeartRateStatus === "high") return "recovery";
  if (input.restingHeartRateStatus === "elevated") return input.checkIn?.cigarettes ? "smoking_reduction_focus" : "mobility";
  if (input.readinessScore < 65) return "mobility";
  if (input.runCount7 >= 3 || (input.runLoadPrev7 > 0 && input.runLoad7 > input.runLoadPrev7 * 1.35)) {
    return "easy_run";
  }
  if (input.checkIn?.cigarettes && input.checkIn.cigarettes > 0 && input.readinessScore < 75) {
    return "smoking_reduction_focus";
  }
  if (input.missingNutritionCount >= 4) return "nutrition_focus";
  return "train";
}

function defaultActions(action: DashboardToday["primaryAction"]) {
  switch (action) {
    case "recovery":
      return [
        "Heute keine harte Laufeinheit: 30-45 Minuten Spaziergang oder sehr lockere Mobility.",
        "Rechte Wade/Schienbein/Knie aktiv beobachten und Schmerzskala im Check-in notieren."
      ];
    case "mobility":
      return [
        "Heute Mobility plus lockere Zone-2-Bewegung statt Intensität.",
        "Fokus auf Waden, Sprunggelenke, Hüfte und kontrolliertes Abrollen."
      ];
    case "easy_run":
      return [
        "Wenn du läufst: bewusst locker, kein Bestzeit-Versuch, Atmung und Schrittgefühl beobachten.",
        "Nach dem Lauf 5 Minuten Waden- und Fußgewölbe-Check notieren."
      ];
    case "nutrition_focus":
      return [
        "Heute Ernährung priorisieren: Waldfruchtjoghurt oder proteinreiche Alternative plus Gemüse/Linsen.",
        "Kreatin und Hydration als einfache Fixpunkte abhaken."
      ];
    case "smoking_reduction_focus":
      return [
        "Heute Zigarettenreduktion als Hauptsieg definieren, Training nur leicht ergänzen.",
        "Trigger und Uhrzeit der ersten Zigarette notieren."
      ];
    case "train":
      return [
        "Du kannst heute trainieren: moderat starten und Intensität nur bei gutem Körpergefühl steigern.",
        "Bei Lauftraining: Herzfrequenz ruhig aufbauen, nicht vom ersten Kilometer treiben lassen."
      ];
  }
}

function headlineFor(action: DashboardToday["primaryAction"], score: number) {
  const prefix = score >= 75 ? "Grünes Licht" : score >= 60 ? "Solide, aber bewusst" : "Heute defensiv";
  const map: Record<DashboardToday["primaryAction"], string> = {
    train: `${prefix}: Trainieren ist sinnvoll`,
    easy_run: `${prefix}: Lockerer Lauf statt Druck`,
    mobility: `${prefix}: Bewegungsqualität priorisieren`,
    recovery: `${prefix}: Regeneration schützt Fortschritt`,
    nutrition_focus: `${prefix}: Ernährung ist heute der Hebel`,
    smoking_reduction_focus: `${prefix}: Verhalten vor Leistung`
  };
  return map[action];
}

function summaryFor(action: DashboardToday["primaryAction"], score: number, riskFlags: string[]) {
  if (riskFlags.length === 0) {
    return `Readiness ${score}/100. Keine starken Warnsignale in den vorhandenen Daten.`;
  }
  return `Readiness ${score}/100. Wichtig heute: ${riskFlags.join(", ")}.`;
}

function buildMetrics(input: {
  sleepHours: number | null;
  stepsToday: number;
  activeEnergyToday: number;
  restingHrLatest: number | null;
  restingHrBaseline: number | null;
  hrvLatest: number | null;
  hrvBaseline: number | null;
  runLoad7: number;
  runLoadPrev7: number;
  runCount7: number;
  calorieTarget: CalorieTarget | null;
}): DashboardMetric[] {
  return [
    {
      label: "Schlaf",
      value: input.sleepHours === null ? "keine Daten" : `${input.sleepHours.toFixed(1)} h`,
      status: input.sleepHours === null ? "neutral" : input.sleepHours >= 7 ? "good" : "watch"
    },
    {
      label: "Ruhepuls",
      value: input.restingHrLatest === null ? "keine Daten" : `${Math.round(input.restingHrLatest)} bpm`,
      detail:
        input.restingHrBaseline === null ? undefined : `28-Tage-Baseline ${Math.round(input.restingHrBaseline)} bpm`,
      status:
        input.restingHrLatest !== null &&
        input.restingHrBaseline !== null &&
        input.restingHrLatest - input.restingHrBaseline >= 5
          ? "watch"
          : "neutral"
    },
    {
      label: "HRV",
      value: input.hrvLatest === null ? "keine Daten" : `${Math.round(input.hrvLatest)} ms`,
      detail: input.hrvBaseline === null ? undefined : `Basis ${Math.round(input.hrvBaseline)} ms`,
      status:
        input.hrvLatest !== null && input.hrvBaseline !== null && input.hrvLatest >= input.hrvBaseline * 0.9
          ? "good"
          : "neutral"
    },
    {
      label: "Laufen 7 Tage",
      value: `${(input.runLoad7 / 1000).toFixed(1)} km`,
      detail: `${input.runCount7} Einheiten, Vorwoche ${(input.runLoadPrev7 / 1000).toFixed(1)} km`,
      status: input.runLoadPrev7 > 0 && input.runLoad7 > input.runLoadPrev7 * 1.4 ? "watch" : "neutral"
    },
    {
      label: "Aktivität heute",
      value: `${Math.round(input.stepsToday)} Schritte`,
      detail: `${Math.round(input.activeEnergyToday)} kcal aktiv`,
      status: input.stepsToday >= 8000 ? "good" : "neutral"
    },
    {
      label: "Kalorienziel",
      value: input.calorieTarget === null ? "offen" : `${formatKcal(input.calorieTarget.targetCalories)} kcal`,
      detail:
        input.calorieTarget === null
          ? "Profil- oder Energiedaten fehlen"
          : `Halten ~${formatKcal(input.calorieTarget.maintenanceCalories)} kcal, Aufbau +${input.calorieTarget.surplusCalories} kcal`,
      status: input.calorieTarget === null ? "neutral" : "good"
    }
  ];
}

type CalorieTarget = {
  maintenanceCalories: number;
  targetCalories: number;
  surplusCalories: number;
};

function getCalorieTarget(db: AppDatabase, date: string): CalorieTarget | null {
  const profile = db
    .prepare(`SELECT age, sex, height_cm, weight_kg, nutrition_goal FROM profile WHERE id = 1`)
    .get() as ProfileEnergyRow | undefined;
  if (!profile) return null;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const historyStart = new Date(dayStart.getTime() - 90 * DAY_MS);
  const healthMaintenance = avgDailyEnergy(db, historyStart, dayStart);
  const formulaMaintenance = estimateFormulaMaintenance(profile);
  const maintenanceCalories = roundToNearest(healthMaintenance ?? formulaMaintenance, 50);
  if (!Number.isFinite(maintenanceCalories) || maintenanceCalories <= 0) return null;

  const surplusCalories = profile.nutrition_goal === "maintain_slow_gain" ? 150 : 0;
  return {
    maintenanceCalories,
    targetCalories: roundToNearest(maintenanceCalories + surplusCalories, 50),
    surplusCalories
  };
}

function avgDailyEnergy(db: AppDatabase, start: Date, end: Date) {
  const rows = db
    .prepare(
      `SELECT date(start_at) AS day,
              SUM(CASE WHEN type = 'basalEnergyBurned' THEN value ELSE 0 END) AS basal,
              SUM(CASE WHEN type = 'activeEnergyBurned' THEN value ELSE 0 END) AS active
       FROM health_samples
       WHERE type IN ('basalEnergyBurned', 'activeEnergyBurned')
         AND start_at >= ?
         AND start_at < ?
       GROUP BY date(start_at)`
    )
    .all(start.toISOString(), end.toISOString()) as { day: string; basal: number; active: number }[];

  const completeDays = rows.filter((row) => row.basal > 1000 && row.active > 50);
  if (completeDays.length < 7) return null;

  return completeDays.reduce((sum, row) => sum + row.basal + row.active, 0) / completeDays.length;
}

function estimateFormulaMaintenance(profile: ProfileEnergyRow) {
  if (!profile.weight_kg || !profile.height_cm || !profile.age) return null;
  const sexOffset = profile.sex === "male" ? 5 : -161;
  const bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + sexOffset;
  return bmr * 1.25;
}

function roundToNearest(value: number | null, step: number) {
  if (value === null) return Number.NaN;
  return Math.round(value / step) * step;
}

function formatKcal(value: number) {
  return value.toLocaleString("de-DE");
}

function getLastNightWindow(dayStart: Date) {
  return {
    start: new Date(dayStart.getTime() - 6 * 60 * 60 * 1000),
    end: new Date(dayStart.getTime() + 14 * 60 * 60 * 1000)
  };
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
    .all(end.toISOString(), start.toISOString()) as { start_at: string; end_at: string }[];
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

  const ms = merged.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  return ms / (60 * 60 * 1000);
}

function sumSamples(db: AppDatabase, type: string, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(value), 0) AS value FROM health_samples
       WHERE type = ? AND start_at >= ? AND start_at < ?`
    )
    .get(type, start.toISOString(), end.toISOString()) as NumberRow;
  return row.value ?? 0;
}

function avgSamples(db: AppDatabase, type: string, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT AVG(value) AS value FROM health_samples
       WHERE type = ? AND start_at >= ? AND start_at < ?`
    )
    .get(type, start.toISOString(), end.toISOString()) as NumberRow;
  return row.value;
}

function latestSample(db: AppDatabase, type: string, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT value FROM health_samples
       WHERE type = ? AND start_at >= ? AND start_at < ?
       ORDER BY start_at DESC LIMIT 1`
    )
    .get(type, start.toISOString(), end.toISOString()) as NumberRow | undefined;
  return row?.value ?? null;
}

function runDistance(db: AppDatabase, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(distance_m), 0) AS value FROM workouts
       WHERE lower(activity_type) LIKE '%running%' AND start_at >= ? AND start_at < ?`
    )
    .get(start.toISOString(), end.toISOString()) as NumberRow;
  return row.value ?? 0;
}

function runCount(db: AppDatabase, start: Date, end: Date) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS value FROM workouts
       WHERE lower(activity_type) LIKE '%running%' AND start_at >= ? AND start_at < ?`
    )
    .get(start.toISOString(), end.toISOString()) as NumberRow;
  return row.value ?? 0;
}

function getLastAiRecommendation(db: AppDatabase, date: string): AiRecommendation | null {
  const row = db
    .prepare(
      `SELECT id, date, model, recommendation_json, created_at
       FROM ai_recommendations
       WHERE date = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(date) as
    | { id: number; date: string; model: string; recommendation_json: string; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    model: row.model,
    recommendation: JSON.parse(row.recommendation_json),
    createdAt: row.created_at
  };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unique(items: string[]) {
  return [...new Set(items)];
}
