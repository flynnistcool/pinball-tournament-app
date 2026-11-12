// Kleine Versionsanzeige rechts unten (auf allen Seiten, auch Infobildschirm).
// Werte kommen beim Bauen aus next.config.mjs:
// - NEXT_PUBLIC_APP_VERSION: Kurz-Kennung des Git-Standes (Vercel), lokal "dev"
// - NEXT_PUBLIC_BUILD_TIME: Zeitpunkt des Builds (ISO)

function formatBuildTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
  const built = formatBuildTime(process.env.NEXT_PUBLIC_BUILD_TIME);
  return (
    <div
      className="pointer-events-none fixed bottom-[calc(4px+env(safe-area-inset-bottom))] right-2 z-[200] select-none rounded-md bg-neutral-500/10 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400"
      aria-label="Programmversion"
    >
      Version {version}
      {built ? ` · ${built}` : ""}
    </div>
  );
}
