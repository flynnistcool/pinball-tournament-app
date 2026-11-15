// 🤖 Abzeichen "Bot · Elo" für KI-Bots (TV dunkel / Handy hell).

export default function BotEloBadge({
  elo,
  variant = "light",
  className = "",
}: {
  elo?: number | null;
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
      title="KI-Bot mit fester Elo"
    >
      🤖 Bot{typeof elo === "number" && Number.isFinite(elo) ? ` · ${Math.round(elo)}` : ""}
    </span>
  );
}
