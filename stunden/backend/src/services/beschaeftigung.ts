import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Kernlogik der Beschaeftigungs-Historie.
//
// Grundprinzip (siehe PLAN.md): Es wird NIE ein Wert ueberschrieben.
// Jede Aenderung ist ein neuer Beschaeftigung-Datensatz mit "gueltigAb".
//
// - aktuellerStand  = juengster Eintrag mit gueltigAb <= heute
// - naechsteAenderung = fruehester Eintrag mit gueltigAb > heute (falls vorhanden)
// ---------------------------------------------------------------------------

export interface BeschaeftigungStand {
  id: string;
  wochenstunden: number;
  ausmassProzent: number;
  gueltigAb: string; // ISO-Datum (YYYY-MM-DD)
  quelle: string;
  notiz: string | null;
  // Verarbeitungsstatus der zugehoerigen Anfrage:
  // "VERARBEITET" | "OFFEN" (bestaetigt, aber noch nicht verarbeitet)
  // | null (manuell erfasst, keine Anfrage – kein Verrechnungsstatus)
  verarbeitungStatus: "VERARBEITET" | "OFFEN" | null;
}

export interface MitarbeiterMitStand {
  id: string;
  vorname: string;
  nachname: string;
  personalnummer: string;
  email: string | null;
  bereich: string | null;
  aktiv: boolean;
  austrittAm: string | null; // ISO-Datum oder null
  aktuellerStand: BeschaeftigungStand | null;
  naechsteAenderung: BeschaeftigungStand | null;
}

// Wandelt einen Prisma-Beschaeftigung-Datensatz in das schlanke
// Ausgabeformat um (Decimal -> number, Date -> ISO-String).
// Der Verarbeitungsstatus wird aus der zugehoerigen Anfrage abgeleitet.
function formatStand(b: {
  id: string;
  wochenstunden: unknown;
  ausmassProzent: unknown;
  gueltigAb: Date;
  quelle: string;
  notiz: string | null;
  aenderungsanfrage?: { status: string } | null;
}): BeschaeftigungStand {
  let verarbeitungStatus: "VERARBEITET" | "OFFEN" | null = null;
  if (b.aenderungsanfrage) {
    verarbeitungStatus =
      b.aenderungsanfrage.status === "VERARBEITET" ? "VERARBEITET" : "OFFEN";
  }
  return {
    id: b.id,
    wochenstunden: Number(b.wochenstunden),
    ausmassProzent: Number(b.ausmassProzent),
    gueltigAb: b.gueltigAb.toISOString().slice(0, 10),
    quelle: b.quelle,
    notiz: b.notiz,
    verarbeitungStatus,
  };
}

// Liefert "heute" um Mitternacht (UTC), damit der Datumsvergleich sauber ist.
function heuteDatum(): Date {
  const jetzt = new Date();
  return new Date(
    Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate())
  );
}

// Ermittelt aktuellen Stand + naechste anstehende Aenderung fuer EINE Person.
export async function standFuerMitarbeiter(
  mitarbeiterId: string
): Promise<{
  aktuellerStand: BeschaeftigungStand | null;
  naechsteAenderung: BeschaeftigungStand | null;
}> {
  const heute = heuteDatum();

  const aktuell = await prisma.beschaeftigung.findFirst({
    where: { mitarbeiterId, gueltigAb: { lte: heute } },
    orderBy: { gueltigAb: "desc" },
    include: { aenderungsanfrage: { select: { status: true } } },
  });

  const naechste = await prisma.beschaeftigung.findFirst({
    where: { mitarbeiterId, gueltigAb: { gt: heute } },
    orderBy: { gueltigAb: "asc" },
    include: { aenderungsanfrage: { select: { status: true } } },
  });

  return {
    aktuellerStand: aktuell ? formatStand(aktuell) : null,
    naechsteAenderung: naechste ? formatStand(naechste) : null,
  };
}

// Eine Zeile eines Stichtags-Exports: Zustand EINER Person, wie er am
// gewaehlten Stichtag gueltig war (juengster Eintrag mit gueltigAb <= Stichtag).
export interface StichtagZeile {
  personalnummer: string;
  nachname: string;
  vorname: string;
  bereich: string | null;
  aktiv: boolean;
  wochenstunden: number;
  ausmassProzent: number;
  gueltigAb: string; // ISO-Datum des gueltigen Eintrags
}

// Liefert fuer ALLE (oder nur aktive) Mitarbeiter den zum Stichtag gueltigen
// Beschaeftigungsstand. Personen ohne Eintrag bis zum Stichtag entfallen.
export async function staendeZumStichtag(
  stichtag: Date,
  nurAktive: boolean
): Promise<StichtagZeile[]> {
  const mitarbeiter = await prisma.mitarbeiter.findMany({
    where: nurAktive ? { aktiv: true } : undefined,
    orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
    include: { beschaeftigungen: { orderBy: { gueltigAb: "asc" } } },
  });

  const zeilen: StichtagZeile[] = [];
  for (const m of mitarbeiter) {
    // Bereits VOR dem Stichtag ausgetreten? Dann am Stichtag nicht beschaeftigt.
    if (m.austrittAm && m.austrittAm < stichtag) continue;

    const gueltige = m.beschaeftigungen.filter((b) => b.gueltigAb <= stichtag);
    if (gueltige.length === 0) continue; // am Stichtag (noch) kein Stand
    const stand = gueltige[gueltige.length - 1];
    zeilen.push({
      personalnummer: m.personalnummer,
      nachname: m.nachname,
      vorname: m.vorname,
      bereich: m.bereich,
      aktiv: m.aktiv,
      wochenstunden: Number(stand.wochenstunden),
      ausmassProzent: Number(stand.ausmassProzent),
      gueltigAb: stand.gueltigAb.toISOString().slice(0, 10),
    });
  }
  return zeilen;
}

// Liefert alle Mitarbeiter inkl. aktuellem Stand fuer das Dashboard.
export async function alleMitarbeiterMitStand(
  nurAktive: boolean = true
): Promise<MitarbeiterMitStand[]> {
  const heute = heuteDatum();

  const mitarbeiter = await prisma.mitarbeiter.findMany({
    // Fuer die aktive Ansicht auch bereits Ausgetretene (austrittAm < heute)
    // ausblenden – nicht nur ueber das aktiv-Flag.
    where: nurAktive
      ? {
          aktiv: true,
          OR: [{ austrittAm: null }, { austrittAm: { gte: heute } }],
        }
      : undefined,
    orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
    include: {
      // Wir holen alle Beschaeftigungen sortiert und werten unten aus.
      beschaeftigungen: {
        orderBy: { gueltigAb: "asc" },
        include: { aenderungsanfrage: { select: { status: true } } },
      },
    },
  });

  return mitarbeiter.map((m) => {
    const vergangenOderHeute = m.beschaeftigungen.filter(
      (b) => b.gueltigAb <= heute
    );
    const zukunft = m.beschaeftigungen.filter((b) => b.gueltigAb > heute);

    const aktuell =
      vergangenOderHeute.length > 0
        ? vergangenOderHeute[vergangenOderHeute.length - 1]
        : null;
    const naechste = zukunft.length > 0 ? zukunft[0] : null;

    return {
      id: m.id,
      vorname: m.vorname,
      nachname: m.nachname,
      personalnummer: m.personalnummer,
      email: m.email,
      bereich: m.bereich,
      aktiv: m.aktiv,
      austrittAm: m.austrittAm ? m.austrittAm.toISOString().slice(0, 10) : null,
      aktuellerStand: aktuell ? formatStand(aktuell) : null,
      naechsteAenderung: naechste ? formatStand(naechste) : null,
    };
  });
}
