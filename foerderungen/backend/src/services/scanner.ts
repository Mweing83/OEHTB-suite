import { prisma } from "../lib/prisma";
import { erzeugeProvider, ladeProviderKonfig } from "./llm/factory";
import { QuellenInfo, ScanFund, QuellenFund } from "./llm/typen";
import { markiereAbgelaufene } from "./fristen";

// Link-Normalisierung fuer den Dedup-Abgleich (Kleinschreibung, ohne
// Protokoll/www/Tracking-Parameter/abschliessenden Slash).
export function normalisiereLink(roh: string): string {
  try {
    const url = new URL(roh);
    const params = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (!/^(utm_|fbclid|gclid)/i.test(k)) params.append(k, v);
    }
    const query = params.toString();
    return (
      url.hostname.toLowerCase().replace(/^www\./, "") +
      url.pathname.replace(/\/+$/, "").toLowerCase() +
      (query ? "?" + query : "")
    );
  } catch {
    return roh.trim().toLowerCase();
  }
}

// Kombinierende diakritische Zeichen (NFD-Zerlegung), z. B. Akzente.
const DIAKRITIKA = new RegExp("[\\u0300-\\u036f]", "g");

// Unscharfer Namensvergleich fuer den Dedup-Abgleich: Kleinschreibung,
// Umlaute/Akzente vereinheitlichen, Satzzeichen raus; gleich oder enthalten.
export function namenAehnlich(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(DIAKRITIKA, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Hoechstens ein Scan gleichzeitig (Modul-Zustand; ein Node-Prozess).
let laeuft = false;
export function scanLaeuft(): boolean {
  return laeuft;
}

const BATCH_GROESSE = 5;

interface Statistik {
  ueberwachung: { geprueft: number; funde: number; neu: number; aktualisierungen: number; uebersprungen: number };
  entdeckung: { funde: number; neu: number; uebersprungen: number };
}

// Fuehrt einen vollstaendigen Scan-Lauf aus. Wirft nie: Fehler landen im
// ScanLauf-Eintrag ("fehler"), Bestandsdaten bleiben unberuehrt.
export async function fuehreScanAus(ausloeser: "ZEITPLAN" | "MANUELL"): Promise<void> {
  if (laeuft) return;
  laeuft = true;
  const lauf = await prisma.scanLauf.create({ data: { ausloeser } });
  const statistik: Statistik = {
    ueberwachung: { geprueft: 0, funde: 0, neu: 0, aktualisierungen: 0, uebersprungen: 0 },
    entdeckung: { funde: 0, neu: 0, uebersprungen: 0 },
  };
  const fehlerListe: string[] = [];

  try {
    // Vorab: abgelaufene Ausschreibungen markieren, damit der Abgleich
    // gegen den aktuellen Stand laeuft.
    await markiereAbgelaufene();

    const provider = erzeugeProvider(await ladeProviderKonfig());

    // ---- Phase 1: Ueberwachung bekannter Quellen (gebuendelt) --------------
    try {
      const quellen = await prisma.foerderquelle.findMany({
        where: { status: "AKTIV" },
        orderBy: { name: "asc" },
      });
      for (let i = 0; i < quellen.length; i += BATCH_GROESSE) {
        const batch = quellen.slice(i, i + BATCH_GROESSE);
        const infos: QuellenInfo[] = batch.map((q) => ({
          name: q.name,
          webseite: q.webseite,
          themen: q.themen,
        }));
        statistik.ueberwachung.geprueft += batch.length;
        const funde = await provider.sucheAusschreibungen(infos);
        statistik.ueberwachung.funde += funde.length;
        for (const fund of funde) {
          await verarbeiteAusschreibungsFund(fund, batch, statistik);
        }
      }
    } catch (err) {
      fehlerListe.push(`Ueberwachung: ${String(err instanceof Error ? err.message : err)}`);
    }

    // ---- Phase 2: Entdeckung neuer Quellen ---------------------------------
    try {
      const alle = await prisma.foerderquelle.findMany({ select: { name: true, status: true } });
      const funde = await provider.entdeckeQuellen(alle.map((q) => q.name));
      statistik.entdeckung.funde = funde.length;
      for (const fund of funde) {
        await verarbeiteQuellenFund(fund, alle.map((q) => q.name), statistik);
      }
    } catch (err) {
      fehlerListe.push(`Entdeckung: ${String(err instanceof Error ? err.message : err)}`);
    }
  } catch (err) {
    fehlerListe.push(String(err instanceof Error ? err.message : err));
  } finally {
    await prisma.scanLauf.update({
      where: { id: lauf.id },
      data: {
        beendet: new Date(),
        statistik: statistik as unknown as object,
        fehler: fehlerListe.length > 0 ? fehlerListe.join(" | ") : null,
      },
    }).catch((e) => console.error("ScanLauf konnte nicht abgeschlossen werden:", e));
    laeuft = false;
  }
}

// Ordnet einen Ausschreibungs-Fund seiner Quelle zu und schreibt ihn als
// Vorschlag (bzw. Aktualisierungsvorschlag), sofern kein Duplikat existiert.
async function verarbeiteAusschreibungsFund(
  fund: ScanFund,
  batch: Array<{ id: string; name: string }>,
  statistik: Statistik
): Promise<void> {
  const quelle = batch.find((q) => namenAehnlich(q.name, fund.quelleName));
  if (!quelle || !fund.titel) {
    statistik.ueberwachung.uebersprungen++;
    return;
  }
  const linkNorm = fund.link ? normalisiereLink(fund.link) : null;

  // Bestehende Zeile suchen: erst ueber den Link, sonst Titel je Quelle.
  const kandidaten = await prisma.ausschreibung.findMany({
    where: linkNorm
      ? { OR: [{ linkNormalisiert: linkNorm }, { foerderquelleId: quelle.id }] }
      : { foerderquelleId: quelle.id },
  });
  const vorhanden = kandidaten.find(
    (k) =>
      (linkNorm && k.linkNormalisiert === linkNorm) ||
      namenAehnlich(k.titel, fund.titel)
  );

  const fristNeu = fund.frist ? new Date(fund.frist + "T00:00:00.000Z") : null;

  if (!vorhanden) {
    await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelle.id,
        titel: fund.titel,
        beschreibung: fund.beschreibung ?? "",
        link: fund.link,
        linkNormalisiert: linkNorm,
        frist: fristNeu,
        laufendEinreichbar: Boolean(fund.laufendEinreichbar),
        foerderhoehe: fund.foerderhoehe,
        status: "VORGESCHLAGEN",
        quelleTyp: "SCAN",
      },
    });
    statistik.ueberwachung.neu++;
    return;
  }

  // Abgelehnt = Tombstone; Vorschlaege nicht doppeln.
  if (vorhanden.status === "ABGELEHNT" || vorhanden.status === "VORGESCHLAGEN") {
    statistik.ueberwachung.uebersprungen++;
    return;
  }

  // Bestandszeile mit geaenderter Frist -> Aktualisierungsvorschlag,
  // sofern nicht schon einer wartet.
  const fristAlt = vorhanden.frist ? vorhanden.frist.toISOString().slice(0, 10) : null;
  if (vorhanden.status === "OFFEN" && fristAlt !== (fund.frist ?? null)) {
    const wartetSchon = await prisma.ausschreibung.findFirst({
      where: { aktualisiertAusschreibungId: vorhanden.id, status: "VORGESCHLAGEN" },
    });
    if (wartetSchon) {
      statistik.ueberwachung.uebersprungen++;
      return;
    }
    await prisma.ausschreibung.create({
      data: {
        foerderquelleId: quelle.id,
        titel: fund.titel,
        beschreibung: fund.beschreibung ?? vorhanden.beschreibung,
        link: fund.link ?? vorhanden.link,
        linkNormalisiert: linkNorm ?? vorhanden.linkNormalisiert,
        frist: fristNeu,
        laufendEinreichbar: Boolean(fund.laufendEinreichbar),
        foerderhoehe: fund.foerderhoehe ?? vorhanden.foerderhoehe,
        status: "VORGESCHLAGEN",
        quelleTyp: "SCAN",
        aktualisiertAusschreibungId: vorhanden.id,
      },
    });
    statistik.ueberwachung.aktualisierungen++;
    return;
  }

  statistik.ueberwachung.uebersprungen++;
}

// Schreibt einen Quellen-Fund als Vorschlag, sofern der Name nicht schon
// (in beliebigem Status, inkl. ARCHIVIERT als Tombstone) existiert.
async function verarbeiteQuellenFund(
  fund: QuellenFund,
  bekannteNamen: string[],
  statistik: Statistik
): Promise<void> {
  const EBENEN = ["BUND", "LAND", "GEMEINDE", "EU", "PRIVAT"];
  const KATEGORIEN = ["PROJEKT", "KERNGESCHAEFT", "BEIDES"];
  if (
    !fund.name ||
    !EBENEN.includes(fund.ebene) ||
    !KATEGORIEN.includes(fund.kategorie) ||
    bekannteNamen.some((n) => namenAehnlich(n, fund.name))
  ) {
    statistik.entdeckung.uebersprungen++;
    return;
  }
  await prisma.foerderquelle.create({
    data: {
      name: fund.name,
      traeger: fund.traeger || fund.name,
      ebene: fund.ebene,
      kategorie: fund.kategorie,
      themen: Array.isArray(fund.themen) ? fund.themen.slice(0, 20) : [],
      beschreibung: fund.beschreibung ?? "",
      webseite: fund.webseite,
      status: "VORGESCHLAGEN",
      quelleTyp: "SCAN",
    },
  });
  statistik.entdeckung.neu++;
}
