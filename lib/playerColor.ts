// 🎨 Spielerfarben: normale Farbe ("#cfe4ff") ODER Verlauf ("linear-gradient(135deg, #a1c4fd, #c2e9fb)").
// - Hintergründe (Avatar, Kreise) → background: farbe (zeigt Verlauf oder Farbe)
// - Stellen, die nur EINE Farbe können (SVG, Rahmen, Leuchten, Farbe + Transparenz) → solidColor()

/** Erste Farbe aus einem Verlauf (oder die Farbe selbst). null = keine Farbe. */
export function solidColor(color: string | null | undefined): string | null {
  const c = String(color ?? "").trim();
  if (!c) return null;
  if (!c.includes("gradient")) return c;
  const m = c.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/);
  return m ? m[0] : null;
}

export function isGradient(color: string | null | undefined): boolean {
  return String(color ?? "").includes("gradient");
}

/** Style-Objekt für einen Hintergrund (Farbe oder Verlauf); leer ohne Farbe */
export function bgStyle(color: string | null | undefined): { background?: string } {
  const c = String(color ?? "").trim();
  return c ? { background: c } : {};
}

/** dezente Verläufe zur Auswahl im Profil */
export const GRADIENT_OPTIONS = [
  "linear-gradient(135deg, #fbc2eb, #a6c1ee)", // rosa → blau
  "linear-gradient(135deg, #a1c4fd, #c2e9fb)", // himmelblau
  "linear-gradient(135deg, #d4fc79, #96e6a1)", // limette → grün
  "linear-gradient(135deg, #84fab0, #8fd3f4)", // mint → aqua
  "linear-gradient(135deg, #ffecd2, #fcb69f)", // pfirsich
  "linear-gradient(135deg, #f6d365, #fda085)", // gold → orange
  "linear-gradient(135deg, #e0c3fc, #8ec5fc)", // flieder → blau
  "linear-gradient(135deg, #fddb92, #d1fdff)", // sonne → eis
];
