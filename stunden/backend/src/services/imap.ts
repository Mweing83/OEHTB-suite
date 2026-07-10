import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../lib/prisma";
import { entschluesseln } from "../lib/krypto";
import { auditLog } from "../lib/audit";
import { anfrageVerarbeiten } from "./anfrage";

// ---------------------------------------------------------------------------
// IMAP-Abruf.
//
// Holt ungelesene Mails von einem IMAP-Postfach (z. B. oesterreichischer
// Dienstleister), legt fuer jede eine Aenderungsanfrage an, verarbeitet sie
// ueber den bestehenden Parsing-Workflow (Pseudonym + KI) und markiert die
// Mail als gelesen.
//
// Konfiguration liegt verschluesselt in den Admin-Einstellungen. Ohne aktive,
// vollstaendige Konfiguration passiert nichts (Struktur ruht).
// ---------------------------------------------------------------------------

const IMAP_SCHLUESSEL = "imap_konfig";
const ABSENDER_SCHLUESSEL = "imap_erlaubte_absender";

export interface ImapKonfig {
  aktiv: boolean;
  host: string;
  port: number;
  secure: boolean;
  benutzer: string;
  passwort?: string; // entschluesselt; in der DB verschluesselt
  intervallMinuten: number;
}

// Laedt die IMAP-Konfiguration (mit entschluesseltem Passwort).
export async function ladeImapKonfig(): Promise<ImapKonfig | null> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: IMAP_SCHLUESSEL },
  });
  if (!eintrag) return null;

  const w = eintrag.wert as Record<string, unknown>;
  const konfig: ImapKonfig = {
    aktiv: Boolean(w.aktiv),
    host: typeof w.host === "string" ? w.host : "",
    port: typeof w.port === "number" ? w.port : 993,
    secure: w.secure !== false, // Standard: TLS an
    benutzer: typeof w.benutzer === "string" ? w.benutzer : "",
    intervallMinuten:
      typeof w.intervallMinuten === "number" ? w.intervallMinuten : 15,
  };

  if (typeof w.passwortVerschluesselt === "string" && w.passwortVerschluesselt) {
    try {
      konfig.passwort = entschluesseln(w.passwortVerschluesselt);
    } catch {
      konfig.passwort = undefined;
    }
  }

  return konfig;
}

// Prueft, ob die Konfiguration vollstaendig genug fuer einen Abruf ist.
function istVollstaendig(k: ImapKonfig | null): k is ImapKonfig {
  return Boolean(
    k && k.host && k.benutzer && k.passwort && k.port
  );
}

// Laedt die Liste erlaubter Absender-Adressen (alle klein geschrieben).
export async function ladeErlaubteAbsender(): Promise<string[]> {
  const eintrag = await prisma.einstellung.findUnique({
    where: { schluessel: ABSENDER_SCHLUESSEL },
  });
  if (!eintrag) return [];
  const w = eintrag.wert as Record<string, unknown>;
  const liste = Array.isArray(w.adressen) ? w.adressen : [];
  return liste
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
}

// Prueft, ob ein Absender auf der erlaubten Liste steht.
// Leere Liste = niemand erlaubt (sicherer Standard: nichts wird angenommen).
function absenderErlaubt(absender: string | null, erlaubte: string[]): boolean {
  if (!absender) return false;
  return erlaubte.includes(absender.trim().toLowerCase());
}

export interface AbrufErgebnis {
  abgerufen: number; // Anzahl verarbeiteter Mails
  abgewiesen: number; // Anzahl verworfener Mails (nicht erlaubter Absender)
  fehler: string | null;
}

// Fuehrt EINEN Abruf durch: ungelesene Mails holen und verarbeiten.
export async function imapAbrufen(): Promise<AbrufErgebnis> {
  const konfig = await ladeImapKonfig();
  if (!istVollstaendig(konfig)) {
    return {
      abgerufen: 0,
      abgewiesen: 0,
      fehler: "IMAP nicht (vollständig) konfiguriert.",
    };
  }

  // Erlaubte Absender einmal pro Abruf laden.
  const erlaubteAbsender = await ladeErlaubteAbsender();

  const client = new ImapFlow({
    host: konfig.host,
    port: konfig.port,
    secure: konfig.secure,
    auth: { user: konfig.benutzer, pass: konfig.passwort! },
    // ImapFlow loggt sonst sehr gespraechig; auf Warnungen reduzieren.
    logger: false,
  });

  let verarbeitet = 0;
  let abgewiesen = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Alle ungelesenen Mails suchen.
      const ungelesen = await client.search({ seen: false });
      const uids = Array.isArray(ungelesen) ? ungelesen : [];

      for (const uid of uids) {
        // Quelltext der Mail holen und parsen.
        const nachricht = await client.fetchOne(String(uid), {
          source: true,
          envelope: true,
        });
        if (!nachricht || !nachricht.source) continue;

        const geparst = await simpleParser(nachricht.source);
        const text =
          (geparst.text && geparst.text.trim()) ||
          (geparst.subject && geparst.subject.trim()) ||
          "";
        const absender = geparst.from?.value?.[0]?.address ?? null;

        // Absenderpruefung: nur erlaubte Adressen werden verarbeitet.
        // Nicht erlaubte Mails werden verworfen, aber protokolliert.
        if (!absenderErlaubt(absender, erlaubteAbsender)) {
          await auditLog({
            aktion: "IMAP_ABSENDER_ABGEWIESEN",
            details: { absender: absender ?? "(unbekannt)" },
          });
          abgewiesen += 1;
          // Als gelesen markieren, damit sie nicht erneut geprueft wird.
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          continue;
        }

        if (text.length >= 3) {
          // Anfrage anlegen und verarbeiten (Pseudonym + KI).
          const anfrage = await prisma.aenderungsanfrage.create({
            data: {
              rohtext: text,
              quelle: "IMAP",
              absenderEmail: absender,
              status: "NEU",
            },
          });

          await auditLog({
            aktion: "ANFRAGE_EINGEREICHT",
            details: { anfrageId: anfrage.id, quelle: "IMAP" },
          });

          try {
            await anfrageVerarbeiten(anfrage.id);
            // Nach erfolgreicher Verarbeitung zur Bestaetigung legen.
            // (Automatik-Modi greifen erst beim manuellen Eingang ueber die
            //  Anfragen-Route; IMAP-Anfragen landen sicher in der Queue.)
            await prisma.aenderungsanfrage.update({
              where: { id: anfrage.id },
              data: { status: "ZUR_BESTAETIGUNG" },
            });
          } catch {
            // Fehlerstatus wurde im Service gesetzt; weiter mit naechster Mail.
          }

          verarbeitet += 1;
        }

        // Mail als gelesen markieren, damit sie nicht erneut verarbeitet wird.
        await client.messageFlagsAdd(String(uid), ["\\Seen"]);
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { abgerufen: verarbeitet, abgewiesen, fehler: null };
  } catch (err) {
    try {
      await client.close();
    } catch {
      // ignorieren
    }
    return {
      abgerufen: verarbeitet,
      abgewiesen,
      fehler: err instanceof Error ? err.message : "Unbekannter IMAP-Fehler",
    };
  }
}

// ---------------------------------------------------------------------------
// Polling: startet einen Timer, der in konfiguriertem Intervall abruft.
// Wird beim Serverstart aufgerufen. Reagiert dynamisch auf die Konfiguration:
// bei jedem Tick wird die aktuelle Konfig gelesen, sodass Aenderungen im
// Admin-Tab ohne Serverneustart wirken.
// ---------------------------------------------------------------------------
let pollingTimer: NodeJS.Timeout | null = null;
let laeuftGerade = false;

export function starteImapPolling(): void {
  // Alle 60 Sekunden pruefen, ob ein Abruf faellig ist.
  const TICK_MS = 60 * 1000;
  let letzterAbruf = 0;

  if (pollingTimer) clearInterval(pollingTimer);

  pollingTimer = setInterval(async () => {
    if (laeuftGerade) return;
    const konfig = await ladeImapKonfig();
    if (!konfig || !konfig.aktiv) return;

    const faellig =
      Date.now() - letzterAbruf >= konfig.intervallMinuten * 60 * 1000;
    if (!faellig) return;

    laeuftGerade = true;
    try {
      const ergebnis = await imapAbrufen();
      letzterAbruf = Date.now();
      if (ergebnis.fehler) {
        console.error("IMAP-Polling-Fehler:", ergebnis.fehler);
      } else if (ergebnis.abgerufen > 0) {
        console.log(`IMAP-Polling: ${ergebnis.abgerufen} Mail(s) verarbeitet.`);
      }
    } finally {
      laeuftGerade = false;
    }
  }, TICK_MS);

  console.log("IMAP-Polling aktiv (prueft minuetlich auf Faelligkeit).");
}
