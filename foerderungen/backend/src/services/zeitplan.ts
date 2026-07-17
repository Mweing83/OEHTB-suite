import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../lib/prisma";
import { fuehreScanAus } from "./scanner";
import { markiereAbgelaufene } from "./fristen";
import { SCAN_SCHLUESSEL, SCAN_STANDARD } from "../lib/konstanten";

// Zwei Cron-Jobs:
// 1. Naechtlich 00:15 – abgelaufene Fristen markieren (immer aktiv).
// 2. Scan gemaess scan_konfig (Wochentag + Stunde, nur wenn aktiv) –
//    wird bei jeder Einstellungs-Aenderung neu registriert.

let scanJob: ScheduledTask | null = null;
let fristenJob: ScheduledTask | null = null;

async function ladeScanKonfig(): Promise<{ aktiv: boolean; wochentag: number; stunde: number }> {
  const zeile = await prisma.einstellung.findUnique({ where: { schluessel: SCAN_SCHLUESSEL } });
  const wert = (zeile?.wert as Record<string, unknown>) ?? {};
  return {
    aktiv: typeof wert.aktiv === "boolean" ? wert.aktiv : SCAN_STANDARD.aktiv,
    wochentag: typeof wert.wochentag === "number" ? wert.wochentag : SCAN_STANDARD.wochentag,
    stunde: typeof wert.stunde === "number" ? wert.stunde : SCAN_STANDARD.stunde,
  };
}

export async function aktualisiereZeitplan(): Promise<void> {
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
  }
  const konfig = await ladeScanKonfig();
  if (!konfig.aktiv) return;
  // "0 6 * * 1" = jeden Montag 06:00.
  // timezone erzwingen: der Container laeuft in UTC, aber die UI zeigt/verspricht
  // Wiener Uhrzeit an - ohne Angabe wuerde node-cron in Systemzeit (UTC) feuern.
  scanJob = cron.schedule(
    `0 ${konfig.stunde} * * ${konfig.wochentag}`,
    () => {
      void fuehreScanAus("ZEITPLAN");
    },
    { timezone: "Europe/Vienna" }
  );
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
