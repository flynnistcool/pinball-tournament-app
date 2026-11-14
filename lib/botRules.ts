// 🤖 KI-Bots + 🎱 Extraball: Regeln, die an mehreren Stellen gelten (Server + Oberfläche).

/** In diesen Formaten dürfen Bots nie mitspielen. */
export const BOT_BLOCKED_FORMATS = ["elimination", "timeplay", "dyp_round_robin"] as const;

export const BOT_BLOCKED_MESSAGE = "🤖 Bots können in diesem Format nicht mitspielen";

function norm(format: string | null | undefined): string {
  return String(format ?? "").trim().toLowerCase();
}

/** true = Bots dürfen in diesem Turnierformat mitspielen */
export function botsAllowedInFormat(format: string | null | undefined): boolean {
  return !(BOT_BLOCKED_FORMATS as readonly string[]).includes(norm(format));
}

/** 🎱 In diesen Formaten wird immer mit Extraball gespielt (Schalter fest an, nicht änderbar). */
export const EXTRABALL_ALWAYS_FORMATS = ["rotation", "timeplay"] as const;

export function extraballForced(format: string | null | undefined): boolean {
  return (EXTRABALL_ALWAYS_FORMATS as readonly string[]).includes(norm(format));
}

/** So wird der Extraball-Schalter angezeigt (bei festen Formaten immer an). */
export function effectiveExtraball(format: string | null | undefined, extraball: boolean | null | undefined): boolean {
  return extraballForced(format) || extraball === true;
}

/**
 * Punkteniveau eines Turniers für Vergleiche (KI-Bots, später Rekorde):
 * - "high"   = Matchplay & Co. MIT Extraball (deutlich höhere Scores)
 * - "normal" = alles ohne Extraball UND Round the Pinball (obwohl dort mit Extraball gespielt wird –
 *              die Scores ähneln Matchplay ohne Extraball)
 * - null     = Daten nicht vergleichbar → nicht verwenden (DYP: Spaßturniere; Timeplay: Zeitlimit)
 */
export type ScoreLevel = "normal" | "high";

export function scoreLevel(format: string | null | undefined, extraball: boolean | null | undefined): ScoreLevel | null {
  const f = norm(format);
  if (f === "dyp_round_robin" || f === "timeplay") return null;
  if (f === "rotation") return "normal";
  return extraball === true ? "high" : "normal";
}

/** 🚫 Elo gibt es in diesen Formaten nie (DYP: Spaßturniere, würde die Flipper-Elo verfälschen). */
export const ELO_BLOCKED_FORMATS = ["dyp_round_robin"] as const;

export function eloAllowedInFormat(format: string | null | undefined): boolean {
  return !(ELO_BLOCKED_FORMATS as readonly string[]).includes(norm(format));
}
