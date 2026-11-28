// ⏱️ Spielzeit je Flipper (Round the Pinball, auch Arcade mit RtP-Spielweise) – reine Regeln.
// Wird beim Erstellen festgelegt (tournaments.play_minutes) und ist ab dem ersten Score gesperrt,
// damit in einem Turnier alle mit derselben Zeit spielen (Statistik/Bots rechnen nach Spielzeit).

/** ⏱️ Hinweis bei Rekorden/Bestwerten aus abweichender Spielzeit: " (5 min)" – bei 10 min / ohne Zeit leer */
export function minutesHint(minutes: number | null | undefined): string {
  return minutes != null && minutes !== 10 ? ` (${minutes} min)` : "";
}

/** Auswahl in Formularen und im Timer */
export const PLAY_MINUTE_OPTIONS = [3, 5, 8, 10, 15, 20] as const;
/** Standard (bisher wurde immer mit 10 Minuten gespielt) */
export const DEFAULT_PLAY_MINUTES = 10;

/** gültige Minuten (1–60, ganze Zahl) oder null */
export function normalizePlayMinutes(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null;
}

/** Spielzeit eines Turniers: nur bei Round the Pinball; fehlt sie (alte Daten) → 10 */
export function playMinutesOf(format: string | null | undefined, playMinutes: number | null | undefined): number | null {
  if (String(format ?? "").toLowerCase() !== "rotation") return null;
  return normalizePlayMinutes(playMinutes) ?? DEFAULT_PLAY_MINUTES;
}

/**
 * Spielzeit für Vergleiche: RtP → seine Minuten (alt: 10); alle anderen Formate (ohne Zeitlimit) gelten wie 10 Minuten
 * (so wurden sie bisher auch zusammen mit RtP-10-Scores verrechnet).
 */
export function effectiveMinutes(format: string | null | undefined, playMinutes: number | null | undefined): number {
  return playMinutesOf(format, playMinutes) ?? DEFAULT_PLAY_MINUTES;
}

/**
 * Umrechnung eines Scores von `fromMin` auf `toMin` Minuten: (to / from) ^ exponent.
 * exponent 1 = im Verhältnis der Zeit (10 → 5 min = × 0,5); im Bot-Labor einstellbar (timeExponent).
 */
export function timeFactor(fromMin: number, toMin: number, exponent = 1): number {
  if (!(fromMin > 0) || !(toMin > 0) || fromMin === toMin) return 1;
  return Math.pow(toMin / fromMin, exponent);
}
