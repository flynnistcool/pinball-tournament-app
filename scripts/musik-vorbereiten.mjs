// 🎵 Musik + Sound-Effekte vorbereiten – Aufruf: npm run musik
//
// Bearbeitet zwei Ordner:
//   public/sounds/rotation/  → Hintergrundmusik Round-the-Pinball-Timer  ("Künstler - Titel-Art.mp3")
//   public/sounds/effekte/   → eigene Sounds für 🔔 Meldungen & Sounds    (Dateiname = Anzeigename)
//
// 1. findet NEUE MP3s (bereits bearbeitete stehen in .bearbeitet.json im jeweiligen Ordner)
// 2. sichert die Originale auf dem Desktop (pinball-musik-original/rotation bzw. /effekte)
// 3. wandelt in 128 kbps um und gleicht die Lautheit an (-16 LUFS, 2 Durchgänge, Klang bleibt)
// 4. erzeugt die Listen lib/rotationTracks.generated.ts und lib/effectSounds.generated.ts
//
// Datei entfernen: löschen und npm run musik erneut starten.
// Braucht ffmpeg (einmalig: winget install Gyan.FFmpeg).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const BACKUP_ROOT = path.join(process.env.USERPROFILE || os.homedir(), "Desktop", "pinball-musik-original");

const TARGET_I = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;

const FOLDERS = [
  {
    key: "rotation",
    title: "🎵 Musik (Rotation-Timer)",
    dir: path.join(ROOT, "public", "sounds", "rotation"),
    backup: path.join(BACKUP_ROOT, "rotation"),
    write: writeMusicList,
  },
  {
    key: "effekte",
    title: "🔔 Sound-Effekte (Meldungen)",
    dir: path.join(ROOT, "public", "sounds", "effekte"),
    backup: path.join(BACKUP_ROOT, "effekte"),
    write: writeEffectsList,
  },
];

// ── ffmpeg finden ────────────────────────────────────────────────────────────
let FF = undefined;
function findFfmpeg() {
  if (FF !== undefined) return FF;
  const tryRun = (bin) => {
    try {
      return spawnSync(bin, ["-version"], { encoding: "utf8" }).status === 0;
    } catch {
      return false;
    }
  };
  FF = null;
  if (tryRun("ffmpeg")) FF = "ffmpeg";
  else {
    const base = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(base)) {
      for (const pkg of fs.readdirSync(base).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
        for (const sub of fs.readdirSync(path.join(base, pkg))) {
          const exe = path.join(base, pkg, sub, "bin", "ffmpeg.exe");
          if (fs.existsSync(exe) && tryRun(exe)) FF = exe;
        }
      }
    }
  }
  return FF;
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
  if (r.status !== 0 || !fs.existsSync(dst) || fs.statSync(dst).size < 2_000) throw new Error(r.stderr || "Umwandlung fehlgeschlagen");
  return Number(j.input_i);
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
const q = (s) => JSON.stringify(s);

// ── Musik: Dateiname → Lied ──────────────────────────────────────────────────
function parseMusicName(file) {
  const stem = file.replace(/\.mp3$/i, "");
  const cut = stem.lastIndexOf("-");
  const category = cut >= 0 ? stem.slice(cut + 1).trim() : "Sonstiges";
  const rest = cut >= 0 ? stem.slice(0, cut).trim() : stem;
  const sep = rest.indexOf(" - ");
  const artist = sep >= 0 ? rest.slice(0, sep).trim() : "";
  const title = sep >= 0 ? rest.slice(sep + 3).trim() : rest.trim();
  return { id: slug(`${title}-${artist}`), title, artist, category: category || "Sonstiges", file };
}

function writeMusicList(files) {
  const tracks = files.map(parseMusicName);
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
  fs.writeFileSync(path.join(ROOT, "lib", "rotationTracks.generated.ts"), ts, "utf8");
  const cats = new Map();
  for (const t of tracks) cats.set(t.category, (cats.get(t.category) || 0) + 1);
  return `${tracks.length} Lieder (+ Standard-Timer) · ` + Array.from(cats, ([c, n]) => `${c} (${n})`).join(" · ");
}

// ── Effekte: Dateiname = Anzeigename ─────────────────────────────────────────
function writeEffectsList(files) {
  const lines = files.map((f) => {
    const label = f.replace(/\.mp3$/i, "").trim();
    return `  { id: ${q("fx:" + slug(label))}, label: ${q(label)}, src: "/sounds/effekte/" + encodeURIComponent(${q(f)}) },`;
  });
  const ts = `// ⚠️ AUTOMATISCH ERZEUGT von "npm run musik" (scripts/musik-vorbereiten.mjs) – nicht von Hand ändern.
// Quelle: Dateien in public/sounds/effekte/ (Dateiname = Anzeigename).

export const GENERATED_EFFECTS: readonly { id: string; label: string; src: string }[] = [
${lines.join("\n")}
];
`;
  fs.writeFileSync(path.join(ROOT, "lib", "effectSounds.generated.ts"), ts, "utf8");
  return `${files.length} eigene Sound${files.length === 1 ? "" : "s"}`;
}

// ── Ablauf ───────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
let failed = false;

for (const F of FOLDERS) {
  fs.mkdirSync(F.dir, { recursive: true });
  const MANIFEST = path.join(F.dir, ".bearbeitet.json");
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
  const files = fs
    .readdirSync(F.dir)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort((a, b) => a.localeCompare(b));

  console.log(`\n${F.title}`);

  // --nur-merken: vorhandene Dateien als bereits bearbeitet eintragen (ohne Umwandeln)
  if (args.has("--nur-merken")) {
    for (const f of files) manifest[f] = { size: fs.statSync(path.join(F.dir, f)).size };
    console.log(`   ✅ ${files.length} Dateien als bearbeitet gemerkt.`);
  }

  const neu = files.filter((f) => !manifest[f] || manifest[f].size !== fs.statSync(path.join(F.dir, f)).size);
  if (neu.length) {
    const ff = findFfmpeg();
    if (!ff) {
      console.error("   ❌ ffmpeg nicht gefunden. Einmalig installieren:  winget install Gyan.FFmpeg");
      failed = true;
      continue;
    }
    fs.mkdirSync(F.backup, { recursive: true });
    console.log(`   ${neu.length} neue Datei(en) – Originale werden gesichert in:\n   ${F.backup}`);
    for (const f of neu) {
      const src = path.join(F.dir, f);
      const bak = path.join(F.backup, f);
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
    console.log("   Keine neuen Dateien.");
  }

  // gelöschte Dateien aus der Merkliste entfernen
  for (const f of Object.keys(manifest)) if (!files.includes(f)) delete manifest[f];
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");

  const total = files.reduce((s, f) => s + fs.statSync(path.join(F.dir, f)).size, 0);
  console.log(`   📋 Liste aktualisiert: ${F.write(files)} – zusammen ${(total / 1048576).toFixed(0)} MB`);
}

console.log('\n➡️  Danach hochladen (oder Claude sagen: "hochladen").');
if (failed) process.exit(1);
