#!/usr/bin/env node
// Drift-Detektor fuer die bewusst duplizierten Teile der Suite.
//
// Portal und die Tools implementieren ihre Auth-/Provisionierungs-Logik je
// EIGENSTAENDIG (kein Cross-Repo-Import – Architektur-Entscheidung). Der Preis:
// sicherheitskritische Invarianten koennen still auseinanderlaufen. Genau das
// ist in Phase 0 passiert (ein Backend liess den Platzhalter "changeme" durch).
//
// Geprueft wird zweierlei:
//
// A) Sicherheits-Guards: NICHT auf Datei-Gleichheit (die Dateien duerfen sich
//    in Rollen-Enums, Prisma-Modellen etc. legitim unterscheiden), sondern auf
//    die gemeinsam geltenden Invarianten:
//   1. Jeder Secret-Guard erkennt DIESELBEN Platzhalter-Begriffe.
//   2. Jeder JWT-Guard erzwingt Mindestlaenge 32 in Produktion.
//   3. Jeder PROVISION-Guard erzwingt Mindestlaenge 16 in Produktion.
//
// B) Identische Kopien (IDENTISCHE_KOPIEN): Dateien, die in mehreren Teilen
//    wortgleich liegen sollen, muessen es auch bleiben.
//
// Bricht mit Exit-Code 1 ab, sobald etwas abweicht – geeignet fuer CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");

// Kanonische Platzhalter-Begriffe, die JEDER Secret-Guard ablehnen muss.
const KANONISCHE_PLATZHALTER = [
  "bitte",
  "ersetzen",
  "aendern",
  "changeme",
  "example",
  "platzhalter",
];

// Guard-Dateien und die je Datei erwarteten Invarianten.
const JWT = "jwt";
const PROVISION = "provision";
const KRYPTO = "krypto";

const dateien = [
  { pfad: "backend/src/lib/auth.ts", arten: [JWT] },
  { pfad: "backend/src/lib/provision.ts", arten: [PROVISION] },
  { pfad: "stunden/backend/src/lib/suiteAuth.ts", arten: [JWT] },
  { pfad: "stunden/backend/src/lib/provision.ts", arten: [PROVISION] },
  { pfad: "stunden/backend/src/lib/krypto.ts", arten: [KRYPTO] },
  { pfad: "handkassen/backend/src/lib/suiteAuth.ts", arten: [JWT] },
  { pfad: "handkassen/backend/src/lib/provision.ts", arten: [PROVISION] },
  { pfad: "foerderungen/backend/src/lib/suiteAuth.ts", arten: [JWT] },
  { pfad: "foerderungen/backend/src/lib/provision.ts", arten: [PROVISION] },
  { pfad: "foerderungen/backend/src/lib/krypto.ts", arten: [KRYPTO] },
];

// Dateien, die bewusst als IDENTISCHE Kopie in mehreren Teilen liegen (kein
// Cross-Import). Wird eine Kopie allein geaendert, laufen die Teile still
// auseinander – ein Fix muss in allen Kopien landen. Verglichen wird der
// Inhalt ohne Ruecksicht auf Zeilenenden.
const BACKENDS = ["backend", "handkassen/backend", "stunden/backend", "foerderungen/backend"];
const FRONTENDS = ["portal", "handkassen/frontend", "stunden/frontend", "foerderungen/frontend"];
const IDENTISCHE_KOPIEN = [
  {
    name: "lib/herkunft.ts (Abwehr fremder Seiten)",
    pfade: BACKENDS.map((t) => `${t}/src/lib/herkunft.ts`),
  },
  {
    name: "lib/krypto.ts (Verschluesselung gespeicherter Schluessel)",
    pfade: ["stunden/backend", "foerderungen/backend"].map((t) => `${t}/src/lib/krypto.ts`),
  },
  {
    name: "index.css (gemeinsames Farbschema)",
    pfade: FRONTENDS.map((t) => `${t}/src/index.css`),
  },
  {
    name: "components/dialog.tsx (Bestaetigungsdialoge)",
    pfade: ["portal", "handkassen/frontend", "stunden/frontend"].map((t) => `${t}/src/components/dialog.tsx`),
  },
];

const befunde = [];

for (const { pfad, arten } of dateien) {
  let inhalt;
  try {
    inhalt = readFileSync(join(wurzel, pfad), "utf8");
  } catch {
    befunde.push(`${pfad}: Datei nicht gefunden (Guard fehlt?).`);
    continue;
  }

  // Alle Platzhalter-Regexe der Datei einsammeln (heuristisch: enthaelt "bitte").
  const regexe = [...inhalt.matchAll(/\/([^/\n]*bitte[^/\n]*)\/i/gi)].map(
    (m) => m[1]
  );
  if (regexe.length === 0) {
    befunde.push(`${pfad}: kein Platzhalter-Guard-Regex gefunden.`);
  } else {
    // Vereinigung aller in der Datei erkannten Begriffe.
    const erkannt = new Set(
      regexe.flatMap((r) => r.split("|").map((t) => t.trim().toLowerCase()))
    );
    const fehlend = KANONISCHE_PLATZHALTER.filter((k) => !erkannt.has(k));
    if (fehlend.length > 0) {
      befunde.push(
        `${pfad}: Platzhalter-Guard laesst durch: ${fehlend.join(", ")} ` +
          `(Guard weicht von Portal/Stunden ab).`
      );
    }
  }

  // Mindestlaengen je Guard-Art.
  if (arten.includes(JWT) && !/<\s*32\b/.test(inhalt)) {
    befunde.push(`${pfad}: JWT-Guard erzwingt keine Mindestlaenge 32.`);
  }
  if (arten.includes(PROVISION) && !/<\s*16\b/.test(inhalt)) {
    befunde.push(`${pfad}: PROVISION-Guard erzwingt keine Mindestlaenge 16.`);
  }

  // Alle Guards muessen in Produktion greifen.
  if (!/NODE_ENV\s*===\s*["']production["']/.test(inhalt)) {
    befunde.push(`${pfad}: Guard prueft nicht auf NODE_ENV === "production".`);
  }
}

for (const { name, pfade } of IDENTISCHE_KOPIEN) {
  const inhalte = pfade.map((pfad) => {
    try {
      return readFileSync(join(wurzel, pfad), "utf8").replace(/\r\n/g, "\n");
    } catch {
      befunde.push(`${pfad}: Datei nicht gefunden (identische Kopie von ${name} fehlt).`);
      return null;
    }
  });
  const abweichend = pfade.filter((_, i) => inhalte[i] !== null && inhalte[i] !== inhalte[0]);
  if (abweichend.length > 0) {
    befunde.push(
      `${name}: ${abweichend.join(", ")} weicht von ${pfade[0]} ab ` +
        `(die Kopien muessen identisch bleiben – Aenderung in alle uebernehmen).`
    );
  }
}

if (befunde.length > 0) {
  console.error("DRIFT ERKANNT in den Sicherheits-Guards bzw. identischen Kopien:\n");
  for (const b of befunde) console.error("  - " + b);
  console.error(
    "\nDie duplizierten Guards muessen dieselben Invarianten erfuellen, " +
      "die identischen Kopien gleich bleiben. Bitte angleichen."
  );
  process.exit(1);
}

console.log(
  `drift-check: OK – ${dateien.length} Sicherheits-Guards konsistent ` +
    `(Platzhalter-Begriffe, Mindestlaengen, Produktions-Check), ` +
    `${IDENTISCHE_KOPIEN.length} Gruppen identischer Kopien gleich.`
);
