import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../lib/prisma";
import { fuehreScanAus } from "./scanner";
import { markiereAbgelaufene } from "./fristen";
import { SCAN_SCHLUESSEL, SCAN_STANDARD } from "../lib/konstanten";

// Drei Cron-Jobs:
// 1. Naechtlich 00:15 – abgelaufene Fristen markieren (immer aktiv).
// 2. Ueberwachungs-Scan woechentlich (Wochentag + Stunde, nur wenn aktiv).
// 3. Entdeckungs-Scan monatlich (Tag des Monats + Stunde, nur wenn aktiv) –
//    getrennt von der Ueberwachung, weil neue Foerderquellen selten
//    entstehen und jeder Lauf Kosten verursacht.
// Die Scan-Jobs werden bei jeder Einstellungs-Aenderung neu registriert.

let ueberwachungJob: ScheduledTask | null = null;
let entdeckungJob: ScheduledTask | null = null;
let fristenJob: ScheduledTask | null = null;

export interface ScanKonfig {
  ueberwachung: { aktiv: boolean; wochentag: number; stunde: number };
  entdeckung: { aktiv: boolean; tag: number; stunde: number };
}

// Liest die gespeicherte Scan-Konfiguration. Versteht auch das ALTE flache
// Format ({ aktiv, wochentag, stunde }) aus der Zeit vor der Trennung und
// bildet es auf die Ueberwachung ab.
export async function ladeScanKonfig(): Promise<ScanKonfig> {
  const zeile = await prisma.einstellung.findUnique({ where: { schluessel: SCAN_SCHLUESSEL } });
  const wert = (zeile?.wert as Record<string, unknown>) ?? {};

  // Altes flaches Format?
  if (typeof wert.aktiv === "boolean" && !wert.ueberwachung) {
    return {
      ueberwachung: {
        aktiv: wert.aktiv,
        wochentag:
          typeof wert.wochentag === "number" ? wert.wochentag : SCAN_STANDARD.ueberwachung.wochentag,
        stunde: typeof wert.stunde === "number" ? wert.stunde : SCAN_STANDARD.ueberwachung.stunde,
      },
      entdeckung: { ...SCAN_STANDARD.entdeckung },
    };
  }

  const u = (wert.ueberwachung as Record<string, unknown>) ?? {};
  const e = (wert.entdeckung as Record<string, unknown>) ?? {};
  return {
    ueberwachung: {
      aktiv: typeof u.aktiv === "boolean" ? u.aktiv : SCAN_STANDARD.ueberwachung.aktiv,
      wochentag:
        typeof u.wochentag === "number" ? u.wochentag : SCAN_STANDARD.ueberwachung.wochentag,
      stunde: typeof u.stunde === "number" ? u.stunde : SCAN_STANDARD.ueberwachung.stunde,
    },
    entdeckung: {
      aktiv: typeof e.aktiv === "boolean" ? e.aktiv : SCAN_STANDARD.entdeckung.aktiv,
      tag: typeof e.tag === "number" ? e.tag : SCAN_STANDARD.entdeckung.tag,
      stunde: typeof e.stunde === "number" ? e.stunde : SCAN_STANDARD.entdeckung.stunde,
    },
  };
}

export async function aktualisiereZeitplan(): Promise<void> {
  if (ueberwachungJob) {
    ueberwachungJob.stop();
    ueberwachungJob = null;
  }
  if (entdeckungJob) {
    entdeckungJob.stop();
    entdeckungJob = null;
  }
  const konfig = await ladeScanKonfig();

  // timezone erzwingen: der Container laeuft in UTC, aber die UI zeigt/verspricht
  // Wiener Uhrzeit an - ohne Angabe wuerde node-cron in Systemzeit (UTC) feuern.
  if (konfig.ueberwachung.aktiv) {
    // "0 6 * * 1" = jeden Montag 06:00.
    ueberwachungJob = cron.schedule(
      `0 ${konfig.ueberwachung.stunde} * * ${konfig.ueberwachung.wochentag}`,
      () => {
        void fuehreScanAus("ZEITPLAN", "UEBERWACHUNG");
      },
      { timezone: "Europe/Vienna" }
    );
  }
  if (konfig.entdeckung.aktiv) {
    // "0 7 1 * *" = am 1. jedes Monats um 07:00.
    entdeckungJob = cron.schedule(
      `0 ${konfig.entdeckung.stunde} ${konfig.entdeckung.tag} * *`,
      () => {
        void fuehreScanAus("ZEITPLAN", "ENTDECKUNG");
      },
      { timezone: "Europe/Vienna" }
    );
  }
}

export async function starteZeitplan(): Promise<void> {
  if (!fristenJob) {
    // Ebenfalls Wiener Zeit, damit "00:15 Nacht" tatsaechlich Wiener Mitternacht
    // (bzw. kurz danach) ist und nicht UTC-Mitternacht (Container-Zeitzone).
    fristenJob = cron.schedule(
      "15 0 * * *",
      () => {
        void markiereAbgelaufene().then((n) => {
          if (n > 0) console.log(`Fristablauf: ${n} Ausschreibung(en) auf ABGELAUFEN gesetzt.`);
        });
      },
      { timezone: "Europe/Vienna" }
    );
  }
  await aktualisiereZeitplan();
}
