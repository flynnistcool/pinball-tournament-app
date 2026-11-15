// Anzeige-Namen der Turnierformate (mit Symbol) + Teilnehmer – für Statistik-Tabellen.

const FORMAT_LABELS: Record<string, string> = {
  matchplay: "⚔️ Matchplay",
  timeplay: "⏱️ Timeplay",
  swiss: "⚖️ Swiss",
  round_robin: "🔄 Round Robin",
  rotation: "🎰 Round the Pinball",
  elimination: "💥 Elimination",
  dyp_round_robin: "👥 DYP",
};

export function formatLabel(format: string | null | undefined): string {
  const f = String(format ?? "").trim();
  return FORMAT_LABELS[f] ?? (f || "—");
}

/** "👤 2 Spieler · 🚫 1 Platzhalter · 🤖 2 Bots" (nur Teile > 0; leer ohne Teilnehmer) */
export function participantsText(
  humans?: number | null,
  placeholders?: number | null,
  bots?: number | null
): string {
  const parts: string[] = [];
  if (humans) parts.push(`👤 ${humans} Spieler`);
  if (placeholders) parts.push(`🚫 ${placeholders} Platzhalter`);
  if (bots) parts.push(`🤖 ${bots} ${bots === 1 ? "Bot" : "Bots"}`);
  return parts.join(" · ");
}

/** "🎰 Round the Pinball • 👤 3 Spieler · 🤖 2 Bots" */
export function formatAndPlayers(
  format: string | null | undefined,
  humans?: number | null,
  placeholders?: number | null,
  bots?: number | null
): string {
  const p = participantsText(humans, placeholders, bots);
  return p ? `${formatLabel(format)} • ${p}` : formatLabel(format);
}
