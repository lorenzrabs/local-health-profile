import { describe, expect, it } from "vitest";
import {
  getDailyCheckIn,
  getHabitDay,
  openDatabase,
  syncHabitBatch,
  syncHealthKitBatch,
  upsertDailyCheckIn,
  upsertHabitDefinition,
  upsertHabitEntry
} from "../server/db";

describe("SQLite persistence", () => {
  it("upserts HealthKit samples and workouts idempotently by sourceId", () => {
    const db = openDatabase(":memory:");

    const payload = {
      deviceName: "Apple Watch",
      samples: [
        {
          sourceId: "sample-1",
          type: "stepCount" as const,
          unit: "count",
          value: 1200,
          startAt: "2026-04-23T08:00:00.000Z",
          endAt: "2026-04-23T09:00:00.000Z"
        }
      ],
      workouts: [
        {
          sourceId: "workout-1",
          activityType: "running",
          startAt: "2026-04-23T10:00:00.000Z",
          endAt: "2026-04-23T10:35:00.000Z",
          durationSeconds: 2100,
          distanceMeters: 5000,
          activeEnergyKcal: 360,
          averageHeartRate: 158
        }
      ]
    };

    syncHealthKitBatch(db, payload);
    syncHealthKitBatch(db, {
      ...payload,
      samples: [{ ...payload.samples[0], value: 1400 }],
      workouts: [{ ...payload.workouts[0], distanceMeters: 5200 }]
    });

    expect((db.prepare("SELECT COUNT(*) AS count FROM health_samples").get() as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT value FROM health_samples WHERE source_id = ?").get("sample-1") as { value: number }).value).toBe(
      1400
    );
    expect((db.prepare("SELECT COUNT(*) AS count FROM workouts").get() as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT distance_m FROM workouts WHERE source_id = ?").get("workout-1") as { distance_m: number }).distance_m).toBe(
      5200
    );
  });

  it("keeps one daily check-in per date", () => {
    const db = openDatabase(":memory:");

    upsertDailyCheckIn(db, {
      date: "2026-04-23",
      cigarettes: 4,
      painAreas: ["rechte Wade"],
      energy: 3
    });
    upsertDailyCheckIn(db, {
      date: "2026-04-23",
      cigarettes: 2,
      painAreas: ["rechtes Knie"],
      energy: 4,
      creatineTaken: true
    });

    expect((db.prepare("SELECT COUNT(*) AS count FROM daily_checkins").get() as { count: number }).count).toBe(1);
    expect(getDailyCheckIn(db, "2026-04-23")).toMatchObject({
      cigarettes: 2,
      painAreas: ["rechtes Knie"],
      energy: 4,
      creatineTaken: true
    });
  });

  it("seeds and upserts binary habits per day", () => {
    const db = openDatabase(":memory:");

    const habit = upsertHabitDefinition(db, { name: "Mobility", sortOrder: 20 });
    expect(habit).toMatchObject({ name: "Mobility", isActive: true });

    const day = upsertHabitEntry(db, {
      date: "2026-04-24",
      habitId: habit?.id ?? 0,
      completed: true
    });
    upsertHabitEntry(db, {
      date: "2026-04-24",
      habitId: habit?.id ?? 0,
      completed: false
    });

    expect(day.definitions.some((definition) => definition.name === "Kreatin")).toBe(true);
    expect(getHabitDay(db, "2026-04-24").entries.find((entry) => entry.habitId === habit?.id)?.completed).toBe(false);
    expect((db.prepare("SELECT COUNT(*) AS count FROM habit_entries").get() as { count: number }).count).toBe(1);
  });

  it("handles local-only habit ids and archived habits without duplicates", () => {
    const db = openDatabase(":memory:");

    const mobility = upsertHabitDefinition(db, { id: 9999, name: "Mobility", sortOrder: 10, isActive: true });
    const mobilityAgain = upsertHabitDefinition(db, { name: "Mobility", sortOrder: 10, isActive: true });
    upsertHabitDefinition(db, { id: mobility?.id, name: "Mobility", sortOrder: 10, isActive: false });

    expect(mobilityAgain?.id).toBe(mobility?.id);
    expect(getHabitDay(db, "2026-04-24").definitions.some((definition) => definition.name === "Mobility")).toBe(false);
    expect((db.prepare("SELECT COUNT(*) AS count FROM habit_definitions WHERE name = 'Mobility'").get() as { count: number }).count).toBe(1);
  });

  it("bidirectionally syncs habits by client id with newest update winning", () => {
    const db = openDatabase(":memory:");

    syncHabitBatch(db, {
      definitions: [
        {
          clientId: "ios-mobility",
          name: "Mobility",
          sortOrder: 20,
          isActive: true,
          updatedAt: "2026-04-24T08:00:00.000Z"
        }
      ],
      entries: [
        {
          habitClientId: "ios-mobility",
          date: "2026-04-24",
          completed: true,
          updatedAt: "2026-04-24T08:05:00.000Z"
        }
      ]
    });

    syncHabitBatch(db, {
      definitions: [
        {
          clientId: "ios-mobility",
          name: "Mobility alt",
          sortOrder: 20,
          isActive: false,
          updatedAt: "2026-04-24T07:00:00.000Z"
        }
      ],
      entries: [
        {
          habitClientId: "ios-mobility",
          date: "2026-04-24",
          completed: false,
          updatedAt: "2026-04-24T07:05:00.000Z"
        }
      ]
    });

    const response = syncHabitBatch(db, {
      definitions: [
        {
          clientId: "ios-mobility",
          name: "Mobility Flow",
          sortOrder: 20,
          isActive: false,
          updatedAt: "2026-04-24T09:00:00.000Z"
        }
      ]
    });

    const synced = response.definitions.find((definition) => definition.clientId === "ios-mobility");
    expect(synced).toMatchObject({ name: "Mobility Flow", isActive: false });
    expect(response.entries.find((entry) => entry.habitClientId === "ios-mobility")?.completed).toBe(true);
    expect((db.prepare("SELECT COUNT(*) AS count FROM habit_definitions WHERE client_id = 'ios-mobility'").get() as { count: number }).count).toBe(1);
  });
});
