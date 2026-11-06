#!/usr/bin/env node
// Versions-Check (Regeln siehe CLAUDE.md im Wurzelverzeichnis):
//   - Suite-Version (Wurzel-package.json) = Portal-Backend = Portal-Frontend
//   - je Teilprogramm: Backend-Version = Frontend-Version
//   - jeweils gleich im Kopf der package-lock.json
// Bricht mit Exit-Code 1 ab, sobald etwas abweicht – geeignet fuer CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");

const GRUPPEN = {
  Suite: ["", "backend", "portal"],
  Handkassen: ["handkassen/backend", "handkassen/frontend"],
  Stunden: ["stunden/backend", "stunden/frontend"],
  Foerderungen: ["foerderungen/backend", "foerderungen/frontend"],
};

function lies(datei) {
  return JSON.parse(readFileSync(join(wurzel, datei), "utf8"));
}

let fehler = 0;
for (const [name, ordner] of Object.entries(GRUPPEN)) {
  const versionen = [];
  for (const o of ordner) {
    const pkg = lies(join(o, "package.json"));
    const lock = lies(join(o, "package-lock.json"));
    versionen.push([`${o || "."}/package.json`, pkg.version]);
    versionen.push([`${o || "."}/package-lock.json`, lock.version]);
    versionen.push([`${o || "."}/package-lock.json (packages[""])`, lock.packages?.[""]?.version]);
  }
  const eindeutig = new Set(versionen.map(([, v]) => v));
  if (eindeutig.size !== 1 || !/^\d+\.\d+\.\d+$/.test(versionen[0][1] ?? "")) {
    fehler++;
    console.error(`✗ ${name}: Versionen weichen ab oder sind ungültig:`);
    for (const [datei, v] of versionen) console.error(`    ${datei}: ${v}`);
  } else {
    console.log(`✓ ${name} v${versionen[0][1]}`);
  }
}

if (fehler) process.exit(1);
