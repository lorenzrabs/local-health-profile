import { describe, it, expect } from "vitest";
import { openDatabase, syncHealthKitBatch } from "../server/db";
import { getMindfulnessSummary } from "../server/mindfulness";
import { syncPayloadSchema } from "../server/validation";

describe("Apple Health mindfulness", () => {
  it("accepts sync sessions, deduplicates repeated sync and merges overlapping sources across local midnight", () => {
    const db = openDatabase(":memory:");
    const payload = syncPayloadSchema.parse({
      samples: [
        {
          sourceId: "watch",
          type: "mindfulSession",
          unit: "min",
          value: 10,
          startAt: "2026-03-28T22:55:00Z",
          endAt: "2026-03-28T23:05:00Z",
        },
        {
          sourceId: "duplicate-source",
          type: "mindfulSession",
          unit: "min",
          value: 3,
          startAt: "2026-03-28T23:02:00Z",
          endAt: "2026-03-28T23:05:00Z",
        },
      ],
      workouts: [],
    });
    syncHealthKitBatch(db, payload);
    syncHealthKitBatch(db, payload);
    expect(getMindfulnessSummary(db, "2026-03-28", "2026-03-30")).toEqual({
      source: "appleHealth",
      totalMinutes: 10,
      days: [
        { date: "2026-03-29", minutes: 5 },
        { date: "2026-03-28", minutes: 5 },
      ],
    });
    expect(
      getMindfulnessSummary(db, "2026-03-29", "2026-03-29").totalMinutes,
    ).toBe(5);
    expect(db.prepare("SELECT COUNT(*) n FROM habit_entries").get()).toEqual({
      n: 0,
    });
    db.close();
  });
  it("does not infer absence or count invalid duration, and measures elapsed time across DST", () => {
    const db = openDatabase(":memory:");
    expect(getMindfulnessSummary(db, "2026-03-29", "2026-03-30").days).toEqual(
      [],
    );
    syncHealthKitBatch(db, {
      samples: [
        {
          sourceId: "dst",
          type: "mindfulSession",
          unit: "min",
          value: 10,
          startAt: "2026-03-29T00:55:00Z",
          endAt: "2026-03-29T01:05:00Z",
        },
        {
          sourceId: "invalid",
          type: "mindfulSession",
          unit: "min",
          value: 1,
          startAt: "2026-03-30T10:00:00Z",
          endAt: "2026-03-30T09:59:00Z",
        },
      ],
      workouts: [],
    });
    expect(getMindfulnessSummary(db, "2026-03-29", "2026-03-30").days).toEqual([
      { date: "2026-03-29", minutes: 10 },
    ]);
    db.close();
  });
});
