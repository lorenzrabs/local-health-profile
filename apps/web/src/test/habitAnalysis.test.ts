import { describe, expect, it } from "vitest";
import { getHabitAnalysis } from "../server/habitAnalysis";
import { localDate, localInstant, shiftDate } from "../shared/dates";
import {
  openDatabase,
  syncHabitBatch,
  syncHealthKitBatch,
  upsertHabitDefinition,
} from "../server/db";
function fixture(yes = 7, no = 7) {
  const db = openDatabase(":memory:");
  upsertHabitDefinition(db, {
    clientId: "test-habit",
    name: "Test habit",
    isActive: true,
  });
  const entries = [],
    samples = [];
  for (let i = 0; i < yes + no; i++) {
    const date = shiftDate("2026-04-01", i),
      next = shiftDate(date, 1);
    entries.push({
      habitClientId: "test-habit",
      date,
      completed: i < yes,
      updatedAt: date + "T12:00:00Z",
    });
    samples.push({
      sourceId: "test-" + i,
      type: "restingHeartRate" as const,
      unit: "count/min",
      value: i < yes ? 62 : 58,
      startAt: next + "T06:00:00Z",
      endAt: next + "T06:01:00Z",
    });
  }
  syncHabitBatch(db, { entries });
  syncHealthKitBatch(db, { samples, workouts: [] });
  return db;
}
describe("habit analysis", () => {
  it("counts only explicitly recorded days in rates; missing days are unknown", () => {
    const db = fixture(3, 1);
    const a = getHabitAnalysis(db, 30, "2026-04-30");
    const h = a.items.find((h) => h.clientId === "test-habit")!;
    expect(h.eventRate).toBe(0.75);
    expect(h.trackedDays).toBe(4);
    expect(h.missingDays).toBe(26);
    expect(h.nonEventDays).toBe(1);
    expect(h.weekdays.reduce((n, w) => n + w.totalDays, 0)).toBe(4);
    expect(h.longestStreak).toBe(3);
    expect(h.currentStreak).toBe(0);
  });
  it("excludes archived habits and their entries without deleting history", () => {
    const db = fixture();
    db.prepare(
      "UPDATE habit_definitions SET is_active=0 WHERE client_id='test-habit'",
    ).run();
    const a = getHabitAnalysis(db, 30, "2026-04-30");
    expect(a.items.some((h) => h.clientId === "test-habit")).toBe(false);
    expect(a.correlations).toEqual([]);
    expect(a.recordedDays).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM habit_entries").get()).toEqual(
      { n: 14 },
    );
  });
  it("compares next-day medians and does not let an outlier dominate", () => {
    const db = fixture();
    db.prepare(
      "UPDATE health_samples SET value=140 WHERE source_id='test-0'",
    ).run();
    const c = getHabitAnalysis(db, 30, "2026-04-30").correlations.find(
      (c) => c.metric === "resting_hr",
    )!;
    expect(c).toMatchObject({
      eventDays: 7,
      comparisonDays: 7,
      eventMedian: 62,
      comparisonMedian: 58,
      delta: 4,
      timing: "nextDay",
      confidence: "exploratory",
    });
    expect(c.eventAverage).toBeGreaterThan(c.eventMedian!);
  });
  it("does not turn untracked dates with measurements into controls", () => {
    const db = fixture();
    syncHealthKitBatch(db, {
      samples: [
        {
          sourceId: "untracked",
          type: "restingHeartRate",
          unit: "count/min",
          value: 90,
          startAt: "2026-04-25T06:00:00Z",
          endAt: "2026-04-25T06:01:00Z",
        },
      ],
      workouts: [],
    });
    expect(
      getHabitAnalysis(db, 30, "2026-04-30").correlations[0].comparisonDays,
    ).toBe(7);
  });
  it("requires seven paired measurements in both groups, and excludes outcomes after the selected end date", () => {
    expect(
      getHabitAnalysis(fixture(6, 8), 30, "2026-04-30").correlations,
    ).toEqual([]);
    expect(getHabitAnalysis(fixture(), 30, "2026-04-14").correlations).toEqual(
      [],
    );
    expect(
      getHabitAnalysis(fixture(), 30, "2026-04-15").correlations,
    ).toHaveLength(1);
  });
  it("supports older habits without client ids and has no cross-request cache", () => {
    const db = fixture();
    db.prepare(
      "UPDATE habit_definitions SET client_id=NULL WHERE client_id='test-habit'",
    ).run();
    const a = getHabitAnalysis(db, 30, "2026-04-30");
    expect(a.correlations[0].habitClientId).toMatch(/^server-/);
    getHabitAnalysis(openDatabase(":memory:"), 30, "2026-04-30");
    expect(getHabitAnalysis(db, 30, "2026-04-30").correlations).toEqual(
      a.correlations,
    );
  });
  it("uses Berlin calendar days and respects summer/winter clock changes", () => {
    expect(localDate("2026-04-01T22:30:00Z")).toBe("2026-04-02");
    expect(localInstant("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
    expect(localInstant("2026-03-30")).toBe("2026-03-29T22:00:00.000Z");
    expect(localInstant("2026-10-26")).toBe("2026-10-25T23:00:00.000Z");
    const db = fixture();
    db.prepare(
      "UPDATE health_samples SET start_at='2026-04-01T22:30:00Z',end_at='2026-04-01T22:31:00Z' WHERE source_id='test-0'",
    ).run();
    expect(
      getHabitAnalysis(db, 30, "2026-04-30").correlations[0].eventDays,
    ).toBe(7);
  });
  it("merges overlapping sleep intervals and never fills missing nights with zero", () => {
    const db = fixture();
    const samples = [];
    for (let i = 0; i < 14; i++) {
      const d = shiftDate("2026-04-01", i),
        next = shiftDate(d, 1);
      for (let j = 0; j < 2; j++)
        samples.push({
          sourceId: `sleep-${i}-${j}`,
          type: "sleepAnalysis" as const,
          unit: "category",
          value: 3,
          startAt: d + "T21:00:00Z",
          endAt: next + "T05:00:00Z",
        });
    }
    syncHealthKitBatch(db, { samples, workouts: [] });
    const c = getHabitAnalysis(db, 30, "2026-04-30").correlations.find(
      (c) => c.metric === "sleep",
    )!;
    expect(c.eventMedian).toBe(8);
    expect(c.comparisonMedian).toBe(8);
    db.prepare(
      "DELETE FROM health_samples WHERE source_id IN ('sleep-0-0','sleep-0-1')",
    ).run();
    expect(
      getHabitAnalysis(db, 30, "2026-04-30").correlations.some(
        (c) => c.metric === "sleep",
      ),
    ).toBe(false);
  });
});

describe("tracked-day comparison", () => {
  it("uses empty habits only on logged days from the first known entry, without modifying records", () => {
    const db = fixture();
    // A second active habit proves the later days were logged.
    upsertHabitDefinition(db, {
      clientId: "other",
      name: "Other",
      isActive: true,
    });
    syncHabitBatch(db, {
      entries: Array.from({ length: 14 }, (_, i) => ({
        habitClientId: "other",
        date: shiftDate("2026-04-01", i),
        completed: true,
      })),
    });
    db.prepare("DELETE FROM habit_entries WHERE completed=0").run();
    const before = db.prepare("SELECT COUNT(*) n FROM habit_entries").get();
    expect(getHabitAnalysis(db, 30, "2026-04-30").correlations).toEqual([]);
    const a = getHabitAnalysis(db, 30, "2026-04-30", "trackedDays");
    const c = a.correlations.find((c) => c.habitClientId === "test-habit")!;
    expect(c).toMatchObject({
      eventDays: 7,
      comparisonDays: 7,
      inferredComparisonDays: 7,
      delta: 4,
    });
    expect(a.items.find((h) => h.clientId === "test-habit")).toMatchObject({
      trackedDays: 14,
      inferredDays: 7,
      eventRate: 0.5,
    });
    expect(a.correlations.some((c) => c.habitClientId === "other")).toBe(false);
    expect(db.prepare("SELECT COUNT(*) n FROM habit_entries").get()).toEqual(
      before,
    );
    // Activity before the first known habit entry must not create controls.
    syncHabitBatch(db, {
      entries: [
        { habitClientId: "other", date: "2026-03-31", completed: true },
      ],
    });
    expect(
      getHabitAnalysis(db, 90, "2026-04-30", "trackedDays").correlations.find(
        (c) => c.habitClientId === "test-habit",
      )?.comparisonDays,
    ).toBe(7);
    db.close();
  });
  it("never uses archive-only days as evidence of daily tracking", () => {
    const db = fixture();
    upsertHabitDefinition(db, {
      clientId: "archived",
      name: "Archived",
      isActive: false,
    });
    syncHabitBatch(db, {
      entries: [
        { habitClientId: "archived", date: "2026-04-15", completed: true },
      ],
    });
    syncHealthKitBatch(db, {
      samples: [
        {
          sourceId: "after-archive",
          type: "restingHeartRate",
          unit: "bpm",
          value: 60,
          startAt: "2026-04-16T10:00:00Z",
          endAt: "2026-04-16T10:01:00Z",
        },
      ],
      workouts: [],
    });
    const c = getHabitAnalysis(db, 30, "2026-04-30", "trackedDays")
      .correlations[0];
    expect(c.comparisonDays).toBe(7);
    expect(c.inferredComparisonDays).toBe(0);
    db.close();
  });
});
