import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime({ offset: true });
const habitDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid date time"
});

export const healthSampleSchema = z.object({
  sourceId: z.string().min(1),
  type: z.enum([
    "heartRate",
    "restingHeartRate",
    "heartRateVariabilitySDNN",
    "stepCount",
    "distanceWalkingRunning",
    "activeEnergyBurned",
    "basalEnergyBurned",
    "vo2Max",
    "sleepAnalysis",
    "mindfulSession"
  ]),
  unit: z.string().min(1),
  value: z.number(),
  startAt: isoDateTime,
  endAt: isoDateTime,
  sourceName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const workoutSchema = z.object({
  sourceId: z.string().min(1),
  activityType: z.string().min(1),
  startAt: isoDateTime,
  endAt: isoDateTime,
  durationSeconds: z.number().nonnegative(),
  distanceMeters: z.number().nullable().optional(),
  activeEnergyKcal: z.number().nullable().optional(),
  averageHeartRate: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const syncPayloadSchema = z.object({
  deviceName: z.string().optional(),
  samples: z.array(healthSampleSchema).default([]),
  workouts: z.array(workoutSchema).default([])
});

export const dailyCheckInSchema = z.object({
  date: isoDate,
  cigarettes: z.number().int().min(0).max(100).optional(),
  painAreas: z.array(z.string()).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  soreness: z.number().int().min(1).max(5).optional(),
  perceivedRecovery: z.number().int().min(1).max(5).optional(),
  sleepQuality: z.number().int().min(1).max(5).optional(),
  proteinOk: z.boolean().optional(),
  creatineTaken: z.boolean().optional(),
  inulinTaken: z.boolean().optional(),
  broccoliOrCruciferous: z.boolean().optional(),
  lentilsOrLegumes: z.boolean().optional(),
  hydrationOk: z.boolean().optional(),
  plannedTraining: z.string().optional(),
  notes: z.string().optional()
});

export const habitDefinitionSchema = z.object({
  id: z.number().int().positive().optional(),
  clientId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  updatedAt: habitDateTime.optional()
});

export const habitEntrySchema = z.object({
  date: isoDate,
  habitId: z.number().int().positive(),
  habitClientId: z.string().trim().min(1).max(120).optional(),
  completed: z.boolean()
});

export const habitSyncSchema = z.object({
  since: habitDateTime.optional(),
  definitions: z.array(habitDefinitionSchema).default([]),
  entries: z
    .array(
      z.object({
        habitId: z.number().int().positive().optional(),
        habitClientId: z.string().trim().min(1).max(120).optional(),
        date: isoDate,
        completed: z.boolean(),
        updatedAt: habitDateTime.optional()
      })
    )
    .default([])
});

export const shoppingListExportItemSchema = z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  amount: z.number().positive().optional(),
  unit: z.string().trim().max(40).optional(),
  category: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  sourceRecipeNames: z.array(z.string().trim().min(1).max(160)).optional()
});

export const shoppingListExportCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  items: z.array(shoppingListExportItemSchema).min(1),
  sourceSnapshot: z.record(z.string(), z.unknown()).optional()
});

export const shoppingListExportConsumeSchema = z.object({
  targetReminderListName: z.string().trim().min(1).max(120),
  createdReminderCount: z.number().int().min(0)
});

export const shoppingListExportErrorSchema = z.object({
  message: z.string().trim().min(1).max(1000)
});
