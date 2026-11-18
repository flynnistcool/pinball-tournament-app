// 💪 Mouseover-Text zum persönlichen Highscore: wann, in welchem Turnier, welches Format.

import { formatLabel } from "@/lib/formatLabel";
import type { PersonalRecordInfo } from "@/lib/recordWatch";

export function personalRecordTitle(info: PersonalRecordInfo | null | undefined): string {
  if (!info) return "Persönlicher Highscore";
  const parts: string[] = [];
  if (info.at) {
    const d = new Date(info.at);
    if (!Number.isNaN(d.getTime())) parts.push("Aufgestellt am " + d.toLocaleDateString("de-DE"));
  }
  if (info.tournament) parts.push(`„${info.tournament}“`);
  if (info.format) parts.push(formatLabel(info.format));
  return parts.length ? parts.join(" · ") : "Persönlicher Highscore";
}
