#!/usr/bin/env node
// Setzt die Version einer Gruppe (Regeln siehe CLAUDE.md im Wurzelverzeichnis)
// in allen zugehörigen package.json und im Kopf der package-lock.json.
//
//   node scripts/version-setzen.mjs <suite|handkassen|stunden|foerderungen> <x.y.z>
//
// Danach prüft `npm run versions-check` die Konsistenz.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");

const GRUPPEN = {
  suite: ["", "backend", "portal"],
  handkassen: ["handkassen/backend", "handkassen/frontend"],
  stunden: ["stunden/backend", "stunden/frontend"],
  foerderungen: ["foerderungen/backend", "foerderungen/frontend"],
};

const [gruppe, version] = process.argv.slice(2);
if (!GRUPPEN[gruppe] || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Aufruf: node scripts/version-setzen.mjs <suite|handkassen|stunden|foerderungen> <x.y.z>");
  process.exit(1);
}

// Nur die ersten "version"-Felder ersetzen (Text statt JSON neu schreiben, damit
// Formatierung und Zeilenenden erhalten bleiben).
function ersetzen(datei, anzahl) {
  const pfad = join(wurzel, datei);
  let text = readFileSync(pfad, "utf8");
  let n = 0;
  text = text.replace(/("version": ")[^"]*"/g, (m, vor) => (n++ < anzahl ? `${vor}${version}"` : m));
  if (n < anzahl) throw new Error(`${datei}: erwartet ${anzahl} Versionsfelder, gefunden ${n}`);
  JSON.parse(text);
  writeFileSync(pfad, text);
  console.log(`${datei} -> ${version}`);
}

for (const ordner of GRUPPEN[gruppe]) {
  ersetzen(join(ordner, "package.json"), 1);
  // Lockfile: Kopf "version" und packages[""].version stehen vor allen Abhängigkeiten.
  ersetzen(join(ordner, "package-lock.json"), 2);
}
