import { prisma } from "../lib/prisma";
import { erzeugeProvider, ladeProviderKonfig } from "./llm/factory";
import { QuellenInfo, ScanFund, QuellenFund, mitWiederholung } from "./llm/typen";
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
  // Der aeussere try/finally muss WIRKLICH alles umschliessen (inkl. des
  // scanLauf.create): scheitert bereits das Anlegen des ScanLauf-Eintrags,
  // wuerde "laeuft" sonst nie wieder auf false gesetzt -> der Scan waere
  // dauerhaft verklemmt (409 bei jedem manuellen Scan, Cron no-opt).
  try {
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
      // Jeder Batch ist EIGENSTAENDIG abgesichert: ein fehlgeschlagener
      // Batch (API-Aussetzer, unparsebare Modellantwort) ueberspringt nur
      // seine Quellen; die uebrigen Batches laufen weiter. Jeder Provider-
      // Aufruf bekommt zusaetzlich einen Wiederholungsversuch.
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
          try {
            const funde = await mitWiederholung(() => provider.sucheAusschreibungen(infos));
            statistik.ueberwachung.funde += funde.length;
            for (const fund of funde) {
              await verarbeiteAusschreibungsFund(fund, batch, statistik);
            }
          } catch (err) {
            fehlerListe.push(
              `Ueberwachung (Batch ${Math.floor(i / BATCH_GROESSE) + 1}, ` +
                `${batch.map((q) => q.name).join(", ").slice(0, 120)}): ` +
                String(err instanceof Error ? err.message : err)
            );
          }
        }
      } catch (err) {
        fehlerListe.push(`Ueberwachung: ${String(err instanceof Error ? err.message : err)}`);
      }

      // ---- Phase 2: Entdeckung neuer Quellen ---------------------------------
      try {
        const alle = await prisma.foerderquelle.findMany({ select: { name: true } });
        const funde = await mitWiederholung(() => provider.entdeckeQuellen(alle.map((q) => q.name)));
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
      // Nur erreichbar, wenn "lauf" tatsaechlich angelegt wurde.
      await prisma.scanLauf.update({
        where: { id: lauf.id },
        data: {
          beendet: new Date(),
          statistik: statistik as unknown as object,
          fehler: fehlerListe.length > 0 ? fehlerListe.join(" | ") : null,
        },
      }).catch((e) => console.error("ScanLauf konnte nicht abgeschlossen werden:", e));
    }
  } catch (err) {
    console.error("Scan-Lauf unerwartet fehlgeschlagen:", err);
  } finally {
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
    // Deterministische Reihenfolge, damit .find() bei mehreren Treffern
    // (z. B. Alt- und Aktualisierungszeile) immer denselben Kandidaten waehlt.
    orderBy: { erstelltAm: "asc" },
  });
  const vorhanden = kandidaten.find(
    (k) =>
      (linkNorm && k.linkNormalisiert === linkNorm) ||
      namenAehnlich(k.titel, fund.titel)
  );

  // Gleicher Link, aber bei einer anderen Quelle gefunden: das ist das
  // Duplikat einer Fremdquelle (z. B. eine Ausschreibung, die auch von einer
  // anderen Foerderquelle beworben wird). Wird uebersprungen und NIE
  // quellenuebergreifend verknuepft, damit kein Fund einer anderen Quelle
  // stillschweigend verschluckt und kein Aktualisierungsvorschlag mit
  // falscher foerderquelleId erzeugt wird.
  if (vorhanden && vorhanden.foerderquelleId !== quelle.id) {
    statistik.ueberwachung.uebersprungen++;
    return;
  }

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

  // Bestandszeile mit geaenderter Frist -> Aktualisierungsvorschlag, sofern
  // nicht schon einer wartet oder derselbe Vorschlag (gleiche Frist) schon
  // einmal abgelehnt wurde. OFFEN und ABGELAUFEN sind beide zulaessig, damit
  // jaehrlich wiederkehrende Ausschreibungen mit gleicher URL nach Fristablauf
  // wieder aufgegriffen werden (uebernehmen() setzt die Bestandszeile ohnehin
  // per PATCH zurueck auf OFFEN).
  const fristAlt = vorhanden.frist ? vorhanden.frist.toISOString().slice(0, 10) : null;
  if (
    (vorhanden.status === "OFFEN" || vorhanden.status === "ABGELAUFEN") &&
    fristAlt !== (fund.frist ?? null)
  ) {
    // Tombstone: ein bereits vorgeschlagener ODER mit derselben Frist bereits
    // abgelehnter Aktualisierungsvorschlag verhindert eine erneute Anlage.
    const bereitsBehandelt = await prisma.ausschreibung.findFirst({
      where: {
        aktualisiertAusschreibungId: vorhanden.id,
        OR: [
          { status: "VORGESCHLAGEN" },
          { status: "ABGELEHNT", frist: fristNeu },
        ],
      },
    });
    if (bereitsBehandelt) {
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
