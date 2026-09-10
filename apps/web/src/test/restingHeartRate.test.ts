import { describe, expect, it } from "vitest";
import { openDatabase, syncHealthKitBatch } from "../server/db";
import { classifyStatus, getRestingHeartRateCoach } from "../server/restingHeartRate";

describe("resting heart rate coach", () => {
  it("classifies missing data", () => {
    const db = openDatabase(":memory:");

    const coach = getRestingHeartRateCoach(db, "2026-04-23");

    expect(coach.status).toBe("missing");
    expect(coach.summary).toContain("zu wenig");
  });

  it("detects elevated and high resting heart rate from personal baseline", () => {
    expect(
      classifyStatus({
        sevenDayAverage: 68,
        baseline28DayAverage: 62,
        bestSevenDayAverage: 59,
        deltaFromBaseline: 6,
        trend90DayDelta: 3
      })
    ).toBe("elevated");

    expect(
      classifyStatus({
        sevenDayAverage: 72,
        baseline28DayAverage: 63,
        bestSevenDayAverage: 59,
        deltaFromBaseline: 9,
        trend90DayDelta: 5
      })
    ).toBe("high");
  });

  it("finds a best phase and exposes baseline deltas", () => {
    const db = openDatabase(":memory:");
    syncHealthKitBatch(db, {
      deviceName: "Apple Watch",
      samples: restingHeartRateSamples("2026-03-27", [...Array(21).fill(62), ...Array(7).fill(57)]),
      workouts: []
    });

    const coach = getRestingHeartRateCoach(db, "2026-04-23");

    expect(coach.status).toBe("best_phase");
    expect(Math.round(coach.sevenDayAverage ?? 0)).toBe(57);
    expect(Math.round(coach.baseline28DayAverage ?? 0)).toBe(62);
    expect(coach.deltaFromBaseline).toBeLessThan(0);
    expect(coach.statusLabel).toBe("Neue Bestphase");
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

it('does not classify a week from just one reading or compare overlapping windows',()=>{
 const db=openDatabase(':memory:');syncHealthKitBatch(db,{samples:restingHeartRateSamples('2026-04-23',[60]),workouts:[]});
 const c=getRestingHeartRateCoach(db,'2026-04-23');expect(c.status).toBe('missing');expect(c.sevenDaySampleDays).toBe(1);expect(c.baselineSampleDays).toBe(0);
});
