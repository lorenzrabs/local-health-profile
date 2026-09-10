import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("API", () => {
  it("requires configured basic credentials for protected routes", async () => {
    const app = await createApp(openDatabase(":memory:"), {
      port: 0,
      dev: false,
      basicAuth: { username: "lorenz", password: "correct horse battery staple" }
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const unauthenticated = await fetch(`${baseUrl}/api/habits`);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toBe('Basic realm="Health Profile", charset="UTF-8"');

    const wrongCredentials = await fetch(`${baseUrl}/api/habits`, {
      headers: { Authorization: `Basic ${Buffer.from("lorenz:wrong").toString("base64")}` }
    });
    expect(wrongCredentials.status).toBe(401);

    const authenticated = await fetch(`${baseUrl}/api/habits`, {
      headers: { Authorization: `Basic ${Buffer.from("lorenz:correct horse battery staple").toString("base64")}` }
    });
    expect(authenticated.status).toBe(200);
  });

  it("keeps the health endpoint public when basic auth is enabled", async () => {
    const app = await createApp(openDatabase(":memory:"), {
      port: 0,
      dev: false,
      basicAuth: { username: "lorenz", password: "correct horse battery staple" }
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    expect(response.status).toBe(200);
  });

  it("accepts a valid pairing token when basic auth is enabled", async () => {
    const app = await createApp(openDatabase(":memory:"), {
      port: 0,
      dev: false,
      basicAuth: { username: "lorenz", password: "correct horse battery staple" }
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const basicAuthorization = `Basic ${Buffer.from("lorenz:correct horse battery staple").toString("base64")}`;

    const pairing = await fetch(`${baseUrl}/api/pairing`, {
      headers: { Authorization: basicAuthorization }
    }).then((response) => response.json() as Promise<{ token: string }>);
    const response = await fetch(`${baseUrl}/api/habits`, {
      headers: { Authorization: `Bearer ${pairing.token}` }
    });

    expect(response.status).toBe(200);
  });

  it("uses the configured public URL for pairing", async () => {
    const app = await createApp(openDatabase(":memory:"), {
      port: 0,
      dev: false,
      publicUrl: "http://health.local/"
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const pairing = await fetch(`http://127.0.0.1:${address.port}/api/pairing`).then(
      (response) => response.json() as Promise<{ serverUrl: string; pairingUrl: string }>
    );

    expect(pairing.serverUrl).toBe("http://health.local");
    expect(pairing.pairingUrl).toContain(encodeURIComponent("http://health.local"));
  });

  it("serves and upserts habit definitions and entries", async () => {
    const app = await createApp(openDatabase(":memory:"), { port: 0, dev: false });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const created = await fetch(`${baseUrl}/api/habits/definitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Mobility" })
    }).then((response) => response.json() as Promise<{ id: number; name: string }>);

    await fetch(`${baseUrl}/api/habits/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-24", habitId: created.id, completed: true })
    });

    const habitDay = await fetch(`${baseUrl}/api/habits?date=2026-04-24`).then(
      (response) =>
        response.json() as Promise<{
          completedCount: number;
          definitions: Array<{ name: string }>;
          entries: Array<{ habitId: number; completed: boolean }>;
        }>
    );

    expect(created.name).toBe("Mobility");
    expect(habitDay.definitions.some((definition) => definition.name === "Mobility")).toBe(true);
    expect(habitDay.entries.find((entry) => entry.habitId === created.id)?.completed).toBe(true);
    expect(habitDay.completedCount).toBe(1);
  });

  it("syncs habit entries by client id for web and iOS clients", async () => {
    const app = await createApp(openDatabase(":memory:"), { port: 0, dev: false });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await fetch(`${baseUrl}/api/habits/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        definitions: [
          {
            clientId: "ios-breathwork",
            name: "Breathwork",
            sortOrder: 30,
            isActive: true,
            updatedAt: "2026-04-24T08:00:00.000Z"
          }
        ]
      })
    });

    await fetch(`${baseUrl}/api/habits/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            habitClientId: "ios-breathwork",
            date: "2026-04-24",
            completed: true,
            updatedAt: "2026-04-24T08:30:00Z"
          }
        ]
      })
    });

    const habitDay = await fetch(`${baseUrl}/api/habits?date=2026-04-24`).then(
      (response) =>
        response.json() as Promise<{
          definitions: Array<{ clientId: string; name: string }>;
          entries: Array<{ habitClientId: string; completed: boolean }>;
        }>
    );

    expect(habitDay.definitions.find((definition) => definition.clientId === "ios-breathwork")?.name).toBe("Breathwork");
    expect(habitDay.entries.find((entry) => entry.habitClientId === "ios-breathwork")?.completed).toBe(true);
  });

  it("serves habit analysis", async () => {
    const app = await createApp(openDatabase(":memory:"), { port: 0, dev: false });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const analysis = await fetch(`${baseUrl}/api/habits/analysis?rangeDays=30&date=2026-04-24`).then(
      (response) =>
        response.json() as Promise<{
          rangeDays: number;
          items: Array<{ name: string; eventDays: number }>;
          correlations: unknown[];
          notes: string[];
        }>
    );

    expect(analysis.rangeDays).toBe(30);
    expect(analysis.items.some((item) => item.name === "Kreatin")).toBe(true);
    expect(Array.isArray(analysis.correlations)).toBe(true);
    expect(analysis.notes.some((note) => note.includes("Wirkungsnachweise"))).toBe(true);
  });

  it("creates, serves, consumes and stores errors for shopping-list exports", async () => {
    const app = await createApp(openDatabase(":memory:"), { port: 0, dev: false });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const invalid = await fetch(`${baseUrl}/api/shopping-list/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Leer", items: [] })
    });
    expect(invalid.status).toBe(400);

    const created = await fetch(`${baseUrl}/api/shopping-list/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Einkaufsliste",
        items: [
          {
            id: "item_brokkoli",
            name: "Brokkoli",
            amount: 500,
            unit: "g",
            category: "Obst & Gemüse",
            sourceRecipeNames: ["Super Veggie Bowl"]
          }
        ],
        sourceSnapshot: {
          recipes: [{ id: "recipe_123", name: "Super Veggie Bowl", portions: 4 }]
        }
      })
    }).then((response) => response.json() as Promise<{ id: string; status: string }>);

    expect(created.status).toBe("pending");

    const pending = await fetch(`${baseUrl}/api/shopping-list/exports/pending`).then(
      (response) =>
        response.json() as Promise<{
          exports: Array<{ id: string; title: string; items: Array<{ name: string }>; consumedAt: string | null }>;
        }>
    );
    expect(pending.exports).toHaveLength(1);
    expect(pending.exports[0].items[0].name).toBe("Brokkoli");

    const errorResult = await fetch(`${baseUrl}/api/shopping-list/exports/${created.id}/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Reminder permission denied" })
    }).then((response) => response.json() as Promise<{ status: string }>);
    expect(errorResult.status).toBe("error_stored");

    const consumed = await fetch(`${baseUrl}/api/shopping-list/exports/${created.id}/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetReminderListName: "Einkauf", createdReminderCount: 1 })
    }).then((response) => response.json() as Promise<{ status: string; createdReminderCount: number }>);

    expect(consumed.status).toBe("consumed");
    expect(consumed.createdReminderCount).toBe(1);

    const afterConsume = await fetch(`${baseUrl}/api/shopping-list/exports/pending`).then(
      (response) => response.json() as Promise<{ exports: unknown[] }>
    );
    expect(afterConsume.exports).toHaveLength(0);
  });
});
