import { describe, expect, it } from "vitest";
import { getHabitAnalysis } from "../server/habitAnalysis";
import { openDatabase, syncHabitBatch, syncHealthKitBatch, upsertHabitDefinition } from "../server/db";

describe("habit analysis", () => {
  it("calculates event rates, streaks and last event date", () => {
    const db = openDatabase(":memory:");
    upsertHabitDefinition(db, { clientId: "habit-sauna", name: "Sauna", sortOrder: 20, isActive: true });
    syncHabitBatch(db, {
      entries: [
        { habitClientId: "habit-sauna", date: "2026-04-21", completed: true, updatedAt: "2026-04-21T12:00:00Z" },
        { habitClientId: "habit-sauna", date: "2026-04-22", completed: true, updatedAt: "2026-04-22T12:00:00Z" },
        { habitClientId: "habit-sauna", date: "2026-04-23", completed: false, updatedAt: "2026-04-23T12:00:00Z" },
        { habitClientId: "habit-sauna", date: "2026-04-24", completed: true, updatedAt: "2026-04-24T12:00:00Z" }
      ]
    });

    const analysis = getHabitAnalysis(db, 30, "2026-04-24");
    const sauna = analysis.items.find((item) => item.clientId === "habit-sauna");

    expect(sauna).toMatchObject({
      name: "Sauna",
      trackedDays: 4,
      eventDays: 3,
      currentStreak: 1,
      longestStreak: 2,
      lastEventDate: "2026-04-24"
    });
    expect(sauna?.eventRate).toBeCloseTo(3 / 30);
  });

  it("calculates same-day and next-day health correlations only with enough data", () => {
    const db = openDatabase(":memory:");
    upsertHabitDefinition(db, { clientId: "habit-late-snack", name: "Mahlzeit/Snacks nach 19 Uhr", sortOrder: 20, isActive: true });

    const entries = [];
    const samples = [];
    for (let day = 1; day <= 20; day += 1) {
      const date = `2026-04-${String(day).padStart(2, "0")}`;
      const next = `2026-04-${String(day + 1).padStart(2, "0")}`;
      const isEvent = day <= 5;
      entries.push({
        habitClientId: "habit-late-snack",
        date,
        completed: isEvent,
        updatedAt: `${date}T12:00:00Z`
      });
      samples.push({
        sourceId: `rhr-${date}`,
        type: "restingHeartRate" as const,
        unit: "count/min",
        value: isEvent ? 62 : 58,
        startAt: `${date}T07:00:00.000Z`,
        endAt: `${date}T07:01:00.000Z`
      });
      samples.push({
        sourceId: `rhr-next-${date}`,
        type: "heartRateVariabilitySDNN" as const,
        unit: "ms",
        value: isEvent ? 45 : 52,
        startAt: `${next}T07:00:00.000Z`,
        endAt: `${next}T07:01:00.000Z`
      });
    }

    syncHabitBatch(db, { entries });
    syncHealthKitBatch(db, { deviceName: "test", samples, workouts: [] });

    const analysis = getHabitAnalysis(db, 30, "2026-04-24");
    const sameDayRhr = analysis.correlations.find(
      (correlation) =>
        correlation.habitClientId === "habit-late-snack" &&
        correlation.metric === "resting_hr" &&
        correlation.timing === "sameDay"
    );
    const nextDayHrv = analysis.correlations.find(
      (correlation) =>
        correlation.habitClientId === "habit-late-snack" &&
        correlation.metric === "hrv" &&
        correlation.timing === "nextDay"
    );

    expect(sameDayRhr?.delta).toBeCloseTo(4);
    expect(sameDayRhr?.eventDays).toBe(5);
    expect(sameDayRhr?.comparisonDays).toBe(15);
    expect(nextDayHrv?.delta).toBeCloseTo(-7);
  });
});
