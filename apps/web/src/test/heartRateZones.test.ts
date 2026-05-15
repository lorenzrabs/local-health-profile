import { describe, expect, it } from "vitest";
import { openDatabase, syncHealthKitBatch } from "../server/db";
import { getHeartRateZones } from "../server/heartRateZones";
import { getTodayDashboard } from "../server/recommendation";

describe("heart rate zones", () => {
  it("calculates dynamic heart-rate-reserve zones from resting HR and running HR samples", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: [
        ...restingHeartRateSamples("2026-03-27", 28, 63),
        ...runningHeartRateSamples("hard-run", "2026-04-20T10:00:00.000Z", [
          ...Array(30).fill(150),
          ...Array(70).fill(178),
          197
        ])
      ],
      workouts: [
        {
          sourceId: "hard-run",
          activityType: "running",
          startAt: "2026-04-20T10:00:00.000Z",
          endAt: "2026-04-20T10:25:00.000Z",
          durationSeconds: 1500,
          distanceMeters: 3500
        }
      ]
    });

    const zones = getHeartRateZones(db, "2026-04-23");

    expect(zones.method).toBe("heart_rate_reserve");
    expect(zones.restingHeartRate).toBe(63);
    expect(zones.estimatedMaxHeartRate).toBe(195);
    expect(zones.sustainedPeak60s).toBe(178);
    expect(zones.zones.find((zone) => zone.id === "aerobic")).toMatchObject({
      low: 142,
      high: 154
    });
  });

  it("includes dynamic zones in the dashboard response", () => {
    const db = openDatabase(":memory:");

    const dashboard = getTodayDashboard(db, "2026-04-23");

    expect(dashboard.heartRateZones.zones).toHaveLength(6);
    expect(dashboard.heartRateZones.method).toBe("heart_rate_reserve");
  });
});

function restingHeartRateSamples(startDate: string, days: number, value: number) {
  const start = new Date(`${startDate}T06:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const timestamp = new Date(start.getTime() + index * 24 * 60 * 60 * 1000).toISOString();
    return {
      sourceId: `rhr-zone-${index}`,
      type: "restingHeartRate" as const,
      unit: "count/min",
      value,
      startAt: timestamp,
      endAt: timestamp
    };
  });
}

function runningHeartRateSamples(sourcePrefix: string, startAt: string, values: number[]) {
  const start = new Date(startAt);
  return values.map((value, index) => {
    const timestamp = new Date(start.getTime() + index * 1000).toISOString();
    return {
      sourceId: `${sourcePrefix}-hr-${index}`,
      type: "heartRate" as const,
      unit: "count/min",
      value,
      startAt: timestamp,
      endAt: timestamp
    };
  });
}
