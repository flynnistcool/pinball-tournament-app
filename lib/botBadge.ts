// 🤖 Text fürs Bot-Abzeichen (überall gleich):
// "👻 Ghost-Bot · Marco" / "⚡ Form-Bot · Flo" / "🤖 Bot · 1500"

export function botBadgeText(kind: string | null | undefined, ownerName: string | null | undefined, elo?: number | null): string {
  if (kind === "ghost") return `👻 Ghost-Bot${ownerName ? ` · ${ownerName}` : ""}`;
  if (kind === "form") return `⚡ Form-Bot${ownerName ? ` · ${ownerName}` : ""}`;
  if (kind === "rival") return `🥊 Rivalen-Bot${ownerName ? ` · ${ownerName}` : ""}`;
  const num = typeof elo === "number" && Number.isFinite(elo) ? ` · ${Math.round(elo)}` : "";
  if (kind === "gambler") return `🔴 Gambler-Bot${num}`;
  if (kind === "pro") return `🟣 Pro-Bot${num}`;
  if (kind === "champion") return "👑 Champion-Bot";
  if (kind === "specialist") return `🟠 Specialist-Bot${num}`;
  if (kind === "character") return `🎭 Charakter-Bot${num}`;
  return `🤖 Bot${typeof elo === "number" && Number.isFinite(elo) ? ` · ${Math.round(elo)}` : ""}`;
}

export function botBadgeTitle(kind: string | null | undefined, ownerName: string | null | undefined): string {
  if (kind === "ghost") return `KI-Bot: spielt wie ${ownerName ?? "ein Spieler"} (aus seinen Scores an diesem Flipper)`;
  if (kind === "form") return `KI-Bot: folgt der aktuellen Form von ${ownerName ?? "einem Spieler"} (letzte 2 Scores ±5 %)`;
  if (kind === "gambler") return "KI-Bot mit fester Elo – sehr wechselhaft: mal Pech, mal Wahnsinn";
  if (kind === "pro") return "KI-Bot mit fester Elo – sehr konstant, kaum Überraschungen";
  if (kind === "specialist") return "KI-Bot mit fester Elo – an seinen 1–2 Lieblingsflippern (je Turnier) deutlich stärker";
  if (kind === "character") return "KI-Bot mit fester Elo – je Turnier Lieblingsflipper (stärker) und Angstflipper (schwächer)";
  if (kind === "champion") return "KI-Bot: spielt wie die Besten – würfelt im Spitzenfeld aller echten Scores am Flipper";
  if (kind === "rival") return `KI-Bot: Rivale von ${ownerName ?? "einem Spieler"} – wird stärker, wenn er verliert, schwächer, wenn er gewinnt`;
  return "KI-Bot mit fester Elo";
}
