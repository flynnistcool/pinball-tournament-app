// 🎵 Musik für den Round-the-Pinball-Timer vorbereiten – Aufruf: npm run musik
//
// 1. findet NEUE MP3s in public/sounds/rotation/ (bereits bearbeitete stehen in .bearbeitet.json)
// 2. sichert die Originale auf dem Desktop (pinball-musik-original/rotation)
// 3. wandelt in 128 kbps um und gleicht die Lautheit an (-16 LUFS, 2 Durchgänge, Klang bleibt)
// 4. erzeugt die Liederliste lib/rotationTracks.generated.ts aus den Dateinamen
//    Schema: "Künstler - Titel-Art.mp3"  → Art = Teil nach dem letzten "-"
//
// Lied entfernen: Datei löschen und npm run musik erneut starten.
// Braucht ffmpeg (einmalig: winget install Gyan.FFmpeg).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIR = path.join(ROOT, "public", "sounds", "rotation");
const MANIFEST = path.join(DIR, ".bearbeitet.json");
const OUT_TS = path.join(ROOT, "lib", "rotationTracks.generated.ts");
const BACKUP = path.join(process.env.USERPROFILE || os.homedir(), "Desktop", "pinball-musik-original", "rotation");

const TARGET_I = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;

// ── ffmpeg finden ────────────────────────────────────────────────────────────
function findFfmpeg() {
  const tryRun = (bin) => {
    try {
      const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
      return r.status === 0;
    } catch {
      return false;
    }
  };
  if (tryRun("ffmpeg")) return "ffmpeg";
  const base = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(base)) {
    for (const pkg of fs.readdirSync(base).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
      const pkgDir = path.join(base, pkg);
      for (const sub of fs.readdirSync(pkgDir)) {
        const exe = path.join(pkgDir, sub, "bin", "ffmpeg.exe");
        if (fs.existsSync(exe) && tryRun(exe)) return exe;
      }
    }
  }
  return null;
}

// ── Dateiname → Lied ─────────────────────────────────────────────────────────
function parseName(file) {
  const stem = file.replace(/\.mp3$/i, "");
  const cut = stem.lastIndexOf("-");
  const category = cut >= 0 ? stem.slice(cut + 1).trim() : "Sonstiges";
  const rest = cut >= 0 ? stem.slice(0, cut).trim() : stem;
  const sep = rest.indexOf(" - ");
  const artist = sep >= 0 ? rest.slice(0, sep).trim() : "";
  const title = sep >= 0 ? rest.slice(sep + 3).trim() : rest.trim();
  const id = `${title}-${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return { id, title, artist, category: category || "Sonstiges", file };
}

// ── Lautheit angleichen ──────────────────────────────────────────────────────
function normalize(ff, src, dst) {
  const measure = spawnSync(
    ff,
    ["-hide_banner", "-nostats", "-i", src, "-af", `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  const m = (measure.stderr || "").match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) throw new Error("Messung fehlgeschlagen");
  const j = JSON.parse(m[0]);
  const af =
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}` +
    `:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  const r = spawnSync(
    ff,
    ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-map", "0:a:0", "-map_metadata", "-1", "-af", af, "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "2", dst],
    { encoding: "utf8" }
  );
  if (r.status !== 0 || !fs.existsSync(dst) || fs.statSync(dst).size < 100_000) throw new Error(r.stderr || "Umwandlung fehlgeschlagen");
  return Number(j.input_i);
}

// ── Liste schreiben ──────────────────────────────────────────────────────────
function writeList(files) {
  const tracks = files.map(parseName);
  const q = (s) => JSON.stringify(s);
  const lines = tracks.map(
    (t) =>
      `  { id: ${q(t.id)}, title: ${q(t.title)}, ${t.artist ? `artist: ${q(t.artist)}, ` : ""}category: ${q(t.category)}, src: rot(${q(t.file)}) },`
  );
  const ts = `// ⚠️ AUTOMATISCH ERZEUGT von "npm run musik" (scripts/musik-vorbereiten.mjs) – nicht von Hand ändern.
// Quelle: Dateien in public/sounds/rotation/ ("Künstler - Titel-Art.mp3").

import type { RotationTrack } from "@/lib/rotationMusic";

/** Datei aus public/sounds/rotation/ (Leerzeichen & Sonderzeichen URL-sicher) */
const rot = (file: string) => "/sounds/rotation/" + encodeURIComponent(file);

export const GENERATED_TRACKS: readonly RotationTrack[] = [
${lines.join("\n")}
];
`;
  fs.writeFileSync(OUT_TS, ts, "utf8");
  return tracks;
}

// ── Ablauf ───────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
fs.mkdirSync(DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith(".mp3"))
  .sort((a, b) => a.localeCompare(b));

// --nur-merken: vorhandene Dateien als bereits bearbeitet eintragen (ohne Umwandeln)
if (args.has("--nur-merken")) {
  for (const f of files) manifest[f] = { size: fs.statSync(path.join(DIR, f)).size };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`✅ ${files.length} Lieder als bearbeitet gemerkt.`);
}

const neu = files.filter((f) => !manifest[f] || manifest[f].size !== fs.statSync(path.join(DIR, f)).size);

if (neu.length) {
  const ff = findFfmpeg();
  if (!ff) {
    console.error("❌ ffmpeg nicht gefunden. Einmalig installieren:  winget install Gyan.FFmpeg");
    process.exit(1);
  }
  fs.mkdirSync(BACKUP, { recursive: true });
  console.log(`🎵 ${neu.length} neue(s) Lied(er) – Originale werden gesichert in:\n   ${BACKUP}\n`);
  for (const f of neu) {
    const src = path.join(DIR, f);
    const bak = path.join(BACKUP, f);
    try {
      if (!fs.existsSync(bak)) fs.copyFileSync(src, bak);
      const tmp = path.join(os.tmpdir(), `musik_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
      const before = fs.statSync(src).size;
      const lufs = normalize(ff, bak, tmp);
      fs.copyFileSync(tmp, src);
      fs.unlinkSync(tmp);
      const after = fs.statSync(src).size;
      manifest[f] = { size: after };
      console.log(
        `   ✅ ${f}\n      ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB · Lautheit ${lufs.toFixed(1)} → ${TARGET_I} LUFS`
      );
    } catch (e) {
      console.log(`   ❌ ${f}: ${String(e?.message || e).slice(0, 200)} – Datei bleibt unverändert`);
    }
  }
} else {
  console.log("🎵 Keine neuen Lieder gefunden.");
}

// gelöschte Lieder aus der Merkliste entfernen
for (const f of Object.keys(manifest)) if (!files.includes(f)) delete manifest[f];
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");

const tracks = writeList(files);
const cats = new Map();
for (const t of tracks) cats.set(t.category, (cats.get(t.category) || 0) + 1);
const total = files.reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0);
console.log(`\n📋 Liederliste aktualisiert: ${tracks.length} Lieder (+ Standard-Timer), zusammen ${(total / 1048576).toFixed(0)} MB`);
console.log("   " + Array.from(cats, ([c, n]) => `${c} (${n})`).join(" · "));
console.log('\n➡️  Danach hochladen (oder Claude sagen: "hochladen").');
