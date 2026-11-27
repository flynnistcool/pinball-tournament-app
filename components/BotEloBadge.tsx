// 🤖 Abzeichen "Bot · Elo" für KI-Bots (TV dunkel / Handy hell).
// 👻/⚡ Ghost-/Form-Bots: "👻 Ghost-Bot · Marco" / "⚡ Form-Bot · Flo" (kind + owner)

import { botBadgeText, botBadgeTitle } from "@/lib/botBadge";

export default function BotEloBadge({
  elo,
  kind,
  owner,
  variant = "light",
  className = "",
}: {
  elo?: number | null;
  /** "fixed" | "ghost" | "form" */
  kind?: string | null;
  /** Spieler, dem ein Ghost-/Form-Bot folgt */
  owner?: string | null;
  variant?: "light" | "tv";
  className?: string;
}) {
  const tone =
    variant === "tv"
      ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/40"
      : "bg-violet-100 text-violet-700";
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.7em] font-semibold leading-none ${tone} ${className}`}
      title={botBadgeTitle(kind, owner)}
    >
      {botBadgeText(kind, owner, elo)}
    </span>
  );
}
