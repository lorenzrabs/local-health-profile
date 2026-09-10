import { describe, expect, it } from "vitest";
import { openDatabase, syncHealthKitBatch, upsertDailyCheckIn } from "../server/db";
import { createAiAnalysis, getTodayDashboard } from "../server/recommendation";

describe("daily recommendation", () => {
  it("moves to recovery when right knee or lower-leg pain is logged", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: [
        {
          sourceId: "sleep-good",
          type: "sleepAnalysis",
          unit: "stage",
          value: 1,
          startAt: "2026-04-22T22:00:00.000Z",
          endAt: "2026-04-23T06:30:00.000Z"
        }
      ],
      workouts: []
    });
    upsertDailyCheckIn(db, {
      date: "2026-04-23",
      painAreas: ["rechtes Knie", "rechte Wade"],
      perceivedRecovery: 3,
      soreness: 4
    });

    const dashboard = getTodayDashboard(db, "2026-04-23");

    expect(dashboard.primaryAction).toBe("recovery");
    expect(dashboard.riskFlags).toContain("Beschwerden beobachten");
  });

  it("flags load spikes after a sharp weekly running increase", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: [],
      workouts: [
        {
          sourceId: "prev-run",
          activityType: "running",
          startAt: "2026-04-10T10:00:00.000Z",
          endAt: "2026-04-10T10:30:00.000Z",
          durationSeconds: 1800,
          distanceMeters: 3000
        },
        {
          sourceId: "run-1",
          activityType: "running",
          startAt: "2026-04-20T10:00:00.000Z",
          endAt: "2026-04-20T10:45:00.000Z",
          durationSeconds: 2700,
          distanceMeters: 6000
        },
        {
          sourceId: "run-2",
          activityType: "running",
          startAt: "2026-04-22T10:00:00.000Z",
          endAt: "2026-04-22T10:45:00.000Z",
          durationSeconds: 2700,
          distanceMeters: 6000
        }
      ]
    });

    const dashboard = getTodayDashboard(db, "2026-04-23");

    expect(dashboard.riskFlags).toContain("Laufbelastung gestiegen");
    expect(["easy_run", "mobility", "recovery"]).toContain(dashboard.primaryAction);
  });

  it("prioritizes recovery when the 7-day resting heart rate is strongly elevated", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: restingHeartRateSamples("2026-03-27", [...Array(21).fill(60), ...Array(7).fill(72)]),
      workouts: []
    });

    const dashboard = getTodayDashboard(db, "2026-04-23");

    expect(dashboard.primaryAction).toBe("recovery");
    expect(dashboard.riskFlags).toContain("Ruhepuls erhöht");
    expect(dashboard.restingHeartRateCoach.status).toBe("high");
    expect(dashboard.actions.join(" ")).toContain("kein hartes Lauftraining");
  });

  it("uses smoking reduction as the main lever when resting heart rate is elevated and cigarettes are logged", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: restingHeartRateSamples("2026-03-27", [...Array(21).fill(60), ...Array(7).fill(66)]),
      workouts: []
    });
    upsertDailyCheckIn(db, {
      date: "2026-04-23",
      cigarettes: 2,
      perceivedRecovery: 4,
      soreness: 2
    });

    const dashboard = getTodayDashboard(db, "2026-04-23");

    expect(dashboard.primaryAction).toBe("smoking_reduction_focus");
    expect(dashboard.restingHeartRateCoach.status).toBe("elevated");
    expect(dashboard.restingHeartRateCoach.drivers).toContain("Check-in: 2 Zigarette(n)");
  });

  it("counts only the last night of asleep stages and ignores awake sleep samples", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: [
        {
          sourceId: "old-night",
          type: "sleepAnalysis",
          unit: "stage",
          value: 3,
          startAt: "2026-04-21T21:00:00.000Z",
          endAt: "2026-04-22T05:00:00.000Z"
        },
        {
          sourceId: "core-1",
          type: "sleepAnalysis",
          unit: "stage",
          value: 3,
          startAt: "2026-04-22T21:00:00.000Z",
          endAt: "2026-04-23T01:00:00.000Z"
        },
        {
          sourceId: "awake",
          type: "sleepAnalysis",
          unit: "stage",
          value: 2,
          startAt: "2026-04-23T01:00:00.000Z",
          endAt: "2026-04-23T01:30:00.000Z"
        },
        {
          sourceId: "rem",
          type: "sleepAnalysis",
          unit: "stage",
          value: 5,
          startAt: "2026-04-23T01:30:00.000Z",
          endAt: "2026-04-23T06:00:00.000Z"
        },
        {
          sourceId: "overlap",
          type: "sleepAnalysis",
          unit: "stage",
          value: 4,
          startAt: "2026-04-23T02:00:00.000Z",
          endAt: "2026-04-23T03:00:00.000Z"
        }
      ],
      workouts: []
    });

    const sleepMetric = getTodayDashboard(db, "2026-04-23").metrics.find((metric) => metric.label === "Schlaf");

    expect(sleepMetric?.value).toBe("8.5 h");
  });

  it("creates an AI analysis snapshot without storing raw history", () => {
    const db = openDatabase(":memory:");
    upsertDailyCheckIn(db, {
      date: "2026-04-23",
      cigarettes: 1,
      proteinOk: true,
      creatineTaken: true
    });

    const analysis = createAiAnalysis(db, "2026-04-23");

    expect(analysis.model).toBe("local-rules-v1");
    expect(analysis.recommendation.actions.length).toBeGreaterThan(0);
    expect(
      (db.prepare("SELECT COUNT(*) AS count FROM ai_recommendations").get() as { count: number }).count
    ).toBe(1);
  });
});

function restingHeartRateSamples(startDate: string, values: number[]) {
  const start = new Date(`${startDate}T06:00:00.000Z`);
  return values.map((value, index) => {
    const timestamp = new Date(start.getTime() + index * 24 * 60 * 60 * 1000).toISOString();
    return {
      sourceId: `rhr-${index}`,
      type: "restingHeartRate" as const,
      unit: "count/min",
      value,
      startAt: timestamp,
      endAt: timestamp
    };
  });
}
