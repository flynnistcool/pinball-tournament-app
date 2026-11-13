// 📱 Persönlicher Spieler-Link (QR-Code) fürs Handy: /s/<CODE>/spieler/<token>
//
// Der Token wird NICHT gespeichert, sondern immer gleich berechnet:
//   token = <playerId>.<Signatur>   Signatur = HMAC-SHA256(Server-Geheimnis, playerId), gekürzt
// → gleicher Spieler = immer derselbe QR-Code (auch nach Archiv/Neuladen).
// Nur wer den Code hat, kann für diesen Spieler eintragen. Nur auf dem Server benutzen!

import crypto from "crypto";

function secret(): string {
  const s = process.env.PLAYER_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!s) throw new Error("Kein Server-Geheimnis für Spieler-Links konfiguriert");
  return s;
}

function sign(playerId: string): string {
  return crypto.createHmac("sha256", secret()).update(`player-link:v1:${playerId}`).digest("base64url").slice(0, 16);
}

export function makePlayerToken(playerId: string): string {
  return `${playerId}.${sign(String(playerId))}`;
}

/** liefert die Spieler-ID, wenn der Token echt ist – sonst null */
export function readPlayerToken(token: string | null | undefined): string | null {
  const t = String(token ?? "").trim();
  const dot = t.lastIndexOf(".");
  if (dot <= 0) return null;
  const playerId = t.slice(0, dot);
  const sig = t.slice(dot + 1);
  const expected = sign(playerId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return playerId;
}
