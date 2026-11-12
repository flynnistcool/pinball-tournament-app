// Kleine Versionsanzeige (Startseite, unter dem Willkommensbild).
// Werte kommen beim Bauen aus next.config.mjs:
// - NEXT_PUBLIC_APP_VERSION: Kurz-Kennung des Git-Standes (Vercel), lokal "dev"
// - NEXT_PUBLIC_BUILD_TIME: Zeitpunkt des Builds (ISO)

function formatBuildTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // feste Zeitzone + festes Format → gleiche Ausgabe auf Server und Browser
  const p = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

export default function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
  const built = formatBuildTime(process.env.NEXT_PUBLIC_BUILD_TIME);
  return (
    <span className="select-none font-mono text-xs text-neutral-400" aria-label="Programmversion">
      Version {version}
      {built ? ` · ${built}` : ""}
    </span>
  );
}
