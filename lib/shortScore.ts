// Große Scores kurz anzeigen: 416.000.000 → "416,0 Mio" (volle Zahl gehört in den Mouseover).

const full = (n: number) => Math.round(n).toLocaleString("de-DE");

export function shortScore(n: number): string {
  const a = Math.abs(n);
  const f = (x: number) => x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (a >= 1e9) return `${f(n / 1e9)} Mrd`;
  if (a >= 1e6) return `${f(n / 1e6)} Mio`;
  if (a >= 1e4) return `${f(n / 1e3)} Tsd`;
  return full(n);
}
