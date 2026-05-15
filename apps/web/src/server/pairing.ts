import crypto from "node:crypto";
import os from "node:os";
import QRCode from "qrcode";
import type { AppDatabase } from "./db";

export async function createPairing(db: AppDatabase, port: number) {
  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const serverUrl = `http://${getLanAddress()}:${port}`;
  db.prepare(`INSERT INTO pairing_tokens (token, label, expires_at) VALUES (?, ?, ?)`).run(
    token,
    "iOS Health Profile",
    expiresAt
  );

  const pairingUrl = `healthprofile://pair?serverUrl=${encodeURIComponent(serverUrl)}&token=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(pairingUrl, {
    margin: 1,
    color: {
      dark: "#1d3028",
      light: "#f6f0df"
    }
  });

  return { serverUrl, token, expiresAt, pairingUrl, qrDataUrl };
}

export function requirePairingToken(db: AppDatabase, authHeader: string | undefined) {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) return false;

  const row = db
    .prepare(`SELECT id, expires_at FROM pairing_tokens WHERE token = ?`)
    .get(token) as { id: number; expires_at: string } | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) return false;

  db.prepare(`UPDATE pairing_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  return true;
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "localhost";
}
