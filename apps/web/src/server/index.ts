import { createApp } from "./app";
import { openDatabase } from "./db";

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.HEALTH_DB_PATH;
const authUsername = process.env.HEALTH_BASIC_AUTH_USERNAME?.trim();
const authPassword = process.env.HEALTH_BASIC_AUTH_PASSWORD;

if (Boolean(authUsername) !== Boolean(authPassword)) {
  throw new Error("HEALTH_BASIC_AUTH_USERNAME and HEALTH_BASIC_AUTH_PASSWORD must be configured together.");
}
if (process.env.NODE_ENV === "production" && (!authUsername || !authPassword)) {
  throw new Error("Health Profile refuses to start in production without basic authentication.");
}

const db = openDatabase(dbPath);
const app = await createApp(db, {
  port,
  dev: process.env.NODE_ENV !== "production",
  basicAuth: authUsername && authPassword ? { username: authUsername, password: authPassword } : undefined,
  publicUrl: process.env.HEALTH_PUBLIC_URL
});

app.listen(port, () => {
  console.log(`Health Profile läuft auf http://localhost:${port}`);
});
