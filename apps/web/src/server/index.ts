import { createApp } from "./app";
import { openDatabase } from "./db";

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.HEALTH_DB_PATH;
const db = openDatabase(dbPath);
const app = await createApp(db, { port, dev: process.env.NODE_ENV !== "production" });

app.listen(port, () => {
  console.log(`Health Profile läuft auf http://localhost:${port}`);
});
