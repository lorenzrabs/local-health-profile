import { describe, expect, it } from "vitest";
import { openDatabase, syncHealthKitBatch } from "../server/db";
import { getTrendDashboard } from "../server/trends";

describe("trend dashboard", () => {
  it("aggregates running, recovery and activity trends", () => {
    const db = openDatabase(":memory:");

    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: [
        {
          sourceId: "steps-1",
          type: "stepCount",
          unit: "count",
          value: 8000,
          startAt: "2026-04-22T10:00:00.000Z",
          endAt: "2026-04-22T11:00:00.000Z"
        },
        {
          sourceId: "rhr-1",
          type: "restingHeartRate",
          unit: "count/min",
          value: 62,
          startAt: "2026-04-22T06:00:00.000Z",
          endAt: "2026-04-22T06:01:00.000Z"
        },
        {
          sourceId: "hrv-1",
          type: "heartRateVariabilitySDNN",
          unit: "ms",
          value: 74,
          startAt: "2026-04-22T06:00:00.000Z",
          endAt: "2026-04-22T06:01:00.000Z"
        },
        {
          sourceId: "sleep-1",
          type: "sleepAnalysis",
          unit: "stage",
          value: 3,
          startAt: "2026-04-21T22:30:00.000Z",
          endAt: "2026-04-22T06:30:00.000Z"
        }
      ],
      workouts: [
        {
          sourceId: "run-1",
          activityType: "running",
          startAt: "2026-04-22T17:00:00.000Z",
          endAt: "2026-04-22T17:40:00.000Z",
          durationSeconds: 2400,
          distanceMeters: 6000
        }
      ]
    });

    const trends = getTrendDashboard(db, 30, "2026-04-23");
    const running = trends.cards.find((card) => card.id === "running");
    const restingHr = trends.cards.find((card) => card.id === "resting_hr");
    const sleep = trends.cards.find((card) => card.id === "sleep");

    expect(trends.cards).toHaveLength(6);
    expect(running?.value).toBe("6.0 km");
    expect(restingHr?.interpretation).toBe("Stabil");
    expect(sleep?.value).toBe("8.0 h");
  });
});
