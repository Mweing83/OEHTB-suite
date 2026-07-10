import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Bestandsnutzer-Import in die Suite.
//
// Liest die Benutzer aus den beiden Tool-Datenbanken (Handkassen, Stunden),
// legt daraus zentrale SuiteUser an (Passwort-Hashes werden UEBERNOMMEN, damit
// bestehende Passwoerter weitergelten), vergibt den Zugriff auf das jeweilige
// Tool mit der heutigen Rolle und schreibt die neue suiteUserId in die
// Tool-DB zurueck (Verknuepfung).
//
// "Gleiche Person in beiden Tools": Wird ueber den Benutzernamen erkannt.
// Handkassen-Benutzername gilt direkt; Stunden-Benutzer haben nur eine E-Mail,
// daraus wird der Benutzername als Teil vor dem @ gebildet. Ueber eine optionale
// Datei import-mapping.json koennen Zuordnungen (stundenEmail -> benutzername)
// ueberschrieben werden.
//
// Aufruf:
//   npm run import            (Trockenlauf: zeigt nur, was passieren wuerde)
//   npm run import -- --apply (fuehrt die Aenderungen wirklich aus)
//
// Env (Dev-Defaults gesetzt):
//   DATABASE_URL           -> Suite-DB (Prisma)
//   HK_DATABASE_URL        -> Handkassen-DB
//   STUNDEN_DATABASE_URL   -> Stunden-DB
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes("--apply");
const HK_URL =
  process.env.HK_DATABASE_URL ||
  "postgresql://handkassen:handkassen@localhost:5432/handkassen";
const STUNDEN_URL =
  process.env.STUNDEN_DATABASE_URL ||
  "postgresql://stunden:stunden_dev_passwort@localhost:5433/stunden";

const prisma = new PrismaClient();

interface Quelle {
  benutzername: string;
  name: string;
  email: string | null;
  passwortHash: string | null;
  passwortSetzen: boolean;
  aktiv: boolean;
  hkRolle?: string; // Rolle im Handkassen-Tool
  stundenRolle?: string; // Rolle im Stunden-Tool
  hkId?: number; // lokale Handkassen-Benutzer-ID (fuer Rueckschreiben)
  stundenId?: string; // lokale Stunden-User-ID (fuer Rueckschreiben)
}

function emailZuBenutzername(email: string): string {
  return email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ".");
}

async function ladeHandkassen(): Promise<Map<string, Quelle>> {
  const map = new Map<string, Quelle>();
  const client = new Client({ connectionString: HK_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, benutzername, name, "passwortHash", "passwortSetzen", aktiv, rolle FROM benutzer`
    );
    for (const r of rows) {
      map.set(r.benutzername.toLowerCase(), {
        benutzername: r.benutzername.toLowerCase(),
        name: r.name,
        email: null,
        passwortHash: r.passwortHash,
        passwortSetzen: r.passwortSetzen,
        aktiv: r.aktiv,
        hkRolle: r.rolle,
        hkId: r.id,
      });
    }
  } finally {
    await client.end();
  }
  return map;
}

async function ladeStunden(
  ziel: Map<string, Quelle>,
  mapping: Record<string, string>
): Promise<void> {
  const client = new Client({ connectionString: STUNDEN_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, email, name, "passwortHash", rolle, aktiv FROM "User"`
    );
    for (const r of rows) {
      const benutzername = (
        mapping[r.email?.toLowerCase()] || emailZuBenutzername(r.email)
      ).toLowerCase();
      const vorhanden = ziel.get(benutzername);
      if (vorhanden) {
        // Gleiche Person: Stunden-Zugriff ergaenzen.
        vorhanden.stundenRolle = r.rolle;
        vorhanden.stundenId = r.id;
        if (!vorhanden.email) vorhanden.email = r.email;
      } else {
        ziel.set(benutzername, {
          benutzername,
          name: r.name || benutzername,
          email: r.email,
          passwortHash: r.passwortHash,
          passwortSetzen: false,
          aktiv: r.aktiv,
          stundenRolle: r.rolle,
          stundenId: r.id,
        });
      }
    }
  } finally {
    await client.end();
  }
}

async function rueckschreibenHk(hkId: number, suiteUserId: string) {
  const client = new Client({ connectionString: HK_URL });
  await client.connect();
  try {
    await client.query(`UPDATE benutzer SET "suiteUserId" = $1 WHERE id = $2`, [
      suiteUserId,
      hkId,
    ]);
  } finally {
    await client.end();
  }
}

async function rueckschreibenStunden(stundenId: string, suiteUserId: string) {
  const client = new Client({ connectionString: STUNDEN_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "User" SET "suiteUserId" = $1 WHERE id = $2`,
      [suiteUserId, stundenId]
    );
  } finally {
    await client.end();
  }
}

async function main() {
  // Optionales Mapping (stundenEmail -> benutzername) aus dem Backend-Ordner.
  let mapping: Record<string, string> = {};
  try {
    const roh = readFileSync(
      path.resolve(process.cwd(), "import-mapping.json"),
      "utf8"
    );
    mapping = JSON.parse(roh);
    console.log(`Mapping geladen: ${Object.keys(mapping).length} Eintraege.`);
  } catch {
    // kein Mapping vorhanden – ok
  }

  const tools = await prisma.tool.findMany();
  const hkTool = tools.find((t) => t.slug === "handkassen");
  const stundenTool = tools.find((t) => t.slug === "stunden");
  if (!hkTool || !stundenTool) {
    throw new Error(
      "Tool-Registry unvollstaendig. Zuerst 'npm run seed' im Suite-Backend ausfuehren."
    );
  }

  const quellen = await ladeHandkassen();
  await ladeStunden(quellen, mapping);

  console.log(
    `\n${quellen.size} Personen gefunden (${APPLY ? "ANWENDEN" : "TROCKENLAUF"}):\n`
  );

  for (const q of quellen.values()) {
    const zugaenge: string[] = [];
    if (q.hkRolle) zugaenge.push(`handkassen:${q.hkRolle}`);
    if (q.stundenRolle) zugaenge.push(`stunden:${q.stundenRolle}`);
    console.log(
      `  ${q.benutzername.padEnd(20)} ${q.name.padEnd(24)} [${zugaenge.join(", ")}]`
    );

    if (!APPLY) continue;

    // SuiteUser anlegen/aktualisieren (Passwort-Hash uebernehmen).
    const user = await prisma.suiteUser.upsert({
      where: { benutzername: q.benutzername },
      update: {},
      create: {
        benutzername: q.benutzername,
        name: q.name,
        email: q.email,
        passwortHash: q.passwortHash,
        // Wenn ein Hash uebernommen wurde, kein erneutes Setzen erzwingen.
        passwortSetzen: q.passwortHash ? false : true,
        aktiv: q.aktiv,
      },
    });

    // Zugriffe setzen.
    if (q.hkRolle) {
      await prisma.zugriff.upsert({
        where: { userId_toolId: { userId: user.id, toolId: hkTool.id } },
        update: { rolle: q.hkRolle },
        create: { userId: user.id, toolId: hkTool.id, rolle: q.hkRolle },
      });
      if (q.hkId) await rueckschreibenHk(q.hkId, user.id);
    }
    if (q.stundenRolle) {
      await prisma.zugriff.upsert({
        where: { userId_toolId: { userId: user.id, toolId: stundenTool.id } },
        update: { rolle: q.stundenRolle },
        create: { userId: user.id, toolId: stundenTool.id, rolle: q.stundenRolle },
      });
      if (q.stundenId) await rueckschreibenStunden(q.stundenId, user.id);
    }
  }

  if (!APPLY) {
    console.log(
      "\nTrockenlauf. Mit  npm run import -- --apply  wirklich uebernehmen."
    );
  } else {
    console.log("\nImport abgeschlossen.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
