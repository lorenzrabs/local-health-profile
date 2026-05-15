import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import type { AppDatabase } from "./db";
import {
  consumeShoppingListExport,
  createShoppingListExport,
  getPendingShoppingListExports,
  getShoppingListExport,
  getHabitDay,
  getHabitSyncState,
  storeShoppingListExportError,
  syncHabitBatch,
  syncHealthKitBatch,
  upsertDailyCheckIn,
  upsertHabitDefinition,
  upsertHabitEntry
} from "./db";
import { createPairing, requirePairingToken } from "./pairing";
import { getHabitAnalysis } from "./habitAnalysis";
import { createAiAnalysis, getTodayDashboard } from "./recommendation";
import { getRecipes } from "./recipes";
import { getTrendDashboard } from "./trends";
import {
  dailyCheckInSchema,
  habitDefinitionSchema,
  habitEntrySchema,
  habitSyncSchema,
  shoppingListExportConsumeSchema,
  shoppingListExportCreateSchema,
  shoppingListExportErrorSchema,
  syncPayloadSchema
} from "./validation";

export async function createApp(db: AppDatabase, options: { port: number; dev?: boolean }) {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "health-profile", time: new Date().toISOString() });
  });

  app.get("/api/pairing", async (_req, res, next) => {
    try {
      res.json(await createPairing(db, options.port));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sync/healthkit", (req, res) => {
    if (!requirePairingToken(db, req.header("authorization"))) {
      res.status(401).json({ error: "Missing or invalid pairing token." });
      return;
    }

    const payload = syncPayloadSchema.parse(req.body);
    const result = syncHealthKitBatch(db, payload);
    res.json({ ok: true, imported: result });
  });

  app.post("/api/checkins", (req, res) => {
    const input = dailyCheckInSchema.parse(req.body);
    res.json(upsertDailyCheckIn(db, input));
  });

  app.get("/api/habits", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
    res.json(getHabitDay(db, date));
  });

  app.post("/api/habits/definitions", (req, res) => {
    const input = habitDefinitionSchema.parse(req.body);
    res.json(upsertHabitDefinition(db, input));
  });

  app.post("/api/habits/entries", (req, res) => {
    const input = habitEntrySchema.parse(req.body);
    res.json(upsertHabitEntry(db, input));
  });

  app.get("/api/habits/sync", (req, res) => {
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    res.json(getHabitSyncState(db, since));
  });

  app.get("/api/habits/analysis", (req, res) => {
    const rawRange = Number(req.query.rangeDays ?? 90);
    const rangeDays = rawRange === 30 || rawRange === 365 ? rawRange : 90;
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(getHabitAnalysis(db, rangeDays, date));
  });

  app.post("/api/habits/sync", (req, res) => {
    const input = habitSyncSchema.parse(req.body);
    res.json(syncHabitBatch(db, input));
  });

  app.get("/api/dashboard/today", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(getTodayDashboard(db, date));
  });

  app.get("/api/dashboard/trends", (req, res) => {
    const rawRange = Number(req.query.rangeDays ?? 90);
    const rangeDays = rawRange === 30 || rawRange === 365 ? rawRange : 90;
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(getTrendDashboard(db, rangeDays, date));
  });

  app.post("/api/ai/analyze", (req, res) => {
    const date = typeof req.body?.date === "string" ? req.body.date : undefined;
    res.json(createAiAnalysis(db, date));
  });

  app.get("/api/recipes", (req, res) => {
    const rawServings = Number(req.query.servings ?? 1);
    const servings = Number.isFinite(rawServings) ? Math.max(1, Math.round(rawServings)) : 1;
    res.json(getRecipes(db, servings));
  });

  app.post("/api/shopping-list/exports", (req, res) => {
    const input = shoppingListExportCreateSchema.parse(req.body);
    res.json(createShoppingListExport(db, input));
  });

  app.get("/api/shopping-list/exports/pending", (_req, res) => {
    res.json({ exports: getPendingShoppingListExports(db) });
  });

  app.get("/api/shopping-list/exports/:id", (req, res) => {
    const item = getShoppingListExport(db, req.params.id);
    if (!item) {
      res.status(404).json({ error: "Shopping-list export not found." });
      return;
    }
    res.json(item);
  });

  app.post("/api/shopping-list/exports/:id/consume", (req, res) => {
    const input = shoppingListExportConsumeSchema.parse(req.body);
    res.json(consumeShoppingListExport(db, req.params.id, input));
  });

  app.post("/api/shopping-list/exports/:id/error", (req, res) => {
    const input = shoppingListExportErrorSchema.parse(req.body);
    res.json(storeShoppingListExportError(db, req.params.id, input));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  });

  if (options.dev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(dirname, "../../dist/client");
    app.use(express.static(clientDist));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  return app;
}
