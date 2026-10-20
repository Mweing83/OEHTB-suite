import { prisma } from "./db.js";
import { SUITE_URL, TOOL_SLUG } from "./suiteAuth.js";
import { altzeileUebernehmen } from "./altzeile.js";

// ---------------------------------------------------------------------------
// Empfangsseite der zentralen User-Provisionierung (Suite -> dieses Tool).
//
// Die Suite ist alleinige Schreibinstanz fuer Benutzer. Dieses Tool spiegelt
// sie nur: es legt lokale Benutzer-Zeilen (fuer die Int-FKs auf Buchungen/
// Kostenstellen/Audit) an bzw. haelt sie aktuell. Identitaet kommt IMMER von
// der Suite, nie umgekehrt.
// ---------------------------------------------------------------------------

const HK_ROLLEN = ["erfasser", "leitung", "finanzen", "admin"] as const;
type HkRolle = (typeof HK_ROLLEN)[number];

export interface ProvisionUserPayload {
  suiteUserId: string;
  benutzername: string;
  name: string;
  email: string | null; // von Handkassen nicht genutzt (kein E-Mail-Feld)
  aktiv: boolean;
  rolle: string | null; // Rolle fuer DIESES Tool, null = kein Zugriff
}

export function provisionSecret(): string {
  const s = process.env.PROVISION_SECRET ?? "";
  const istPlatzhalter = /bitte|ersetzen|aendern|changeme|example|platzhalter/i.test(s);
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < 16 || istPlatzhalter) {
      throw new Error(
        "PROVISION_SECRET fehlt oder ist zu kurz (min. 16 Zeichen, identisch mit dem Suite-Portal)."
      );
    }
  }
  return s || "dev-provision-secret";
}

// Legt den lokalen Spiegel an bzw. aktualisiert ihn (idempotent, per suiteUserId).
// quelle "push": einzelner Auftrag aus der Outbox (kann veraltet sein).
// quelle "snapshot": massgeblicher Gesamtstand beim Start (reconcile).
export async function applyUpsert(
  p: ProvisionUserPayload,
  quelle: "push" | "snapshot" = "push"
): Promise<void> {
  const gueltig = HK_ROLLEN.includes((p.rolle ?? "") as HkRolle);
  const rolle = (gueltig ? (p.rolle as HkRolle) : "erfasser") as HkRolle;
  // Ohne gueltige Rolle (Zugriff entzogen) oder zentral inaktiv -> gesperrt.
  const aktiv = p.aktiv && gueltig;

  const vorhanden = await prisma.benutzer.findUnique({
    where: { suiteUserId: p.suiteUserId },
  });
  if (vorhanden) {
    // Ein Tombstone wird durch einen (moeglicherweise veralteten) Push nicht
    // zurueckgenommen – nur der massgebliche Snapshot beim Start darf das
    // (Security-Audit 2026-10: veralteter UPSERT nach DELETE).
    if (vorhanden.geloescht && quelle === "push") {
      console.warn(`Provision: UPSERT fuer geloeschten Benutzer ${p.suiteUserId} ignoriert.`);
      return;
    }
    await prisma.benutzer.update({
      where: { id: vorhanden.id },
      data: { name: p.name, rolle, aktiv, geloescht: false },
    });
    return;
  }

  // Noch nicht verknuepft: evtl. gleichnamigen Bestandsnutzer uebernehmen.
  const gleich = await prisma.benutzer.findUnique({
    where: { benutzername: p.benutzername },
  });
  if (gleich && !gleich.suiteUserId) {
    // Ohne Kostenstellen-Freischaltungen, mit Audit-Eintrag (lib/altzeile.ts).
    await altzeileUebernehmen(
      gleich,
      { suiteUserId: p.suiteUserId, name: p.name, rolle, aktiv, geloescht: false },
      "provisionierung"
    );
    return;
  }

  await prisma.benutzer.create({
    data: {
      suiteUserId: p.suiteUserId,
      benutzername: p.benutzername,
      name: p.name,
      rolle,
      aktiv,
      passwortSetzen: false, // Login liegt im Portal
      geloescht: false,
    },
  });
}

// Tombstone: sperrt den Benutzer, erhaelt aber Buchungen/Audit-Historie.
export async function applyDelete(suiteUserId: string): Promise<void> {
  const r = await prisma.benutzer.updateMany({
    where: { suiteUserId },
    data: { aktiv: false, geloescht: true },
  });
  // Unbekannter Benutzer: gesperrte Platzhalter-Zeile anlegen, damit ein
  // spaeterer Zugriff mit einem alten Token nicht in den Create-Fallback der
  // Middleware laeuft und den Benutzer aktiv anlegt (Security-Audit 2026-10).
  if (r.count === 0) {
    await prisma.benutzer.create({
      data: {
        suiteUserId,
        benutzername: `geloescht:${suiteUserId}`,
        name: "(zentral gelöscht)",
        rolle: "erfasser",
        passwortSetzen: false,
        aktiv: false,
        geloescht: true,
      },
    });
  }
}

// Startup-Abgleich (Self-Heal): vollstaendige SOLL-Liste vom Portal holen und
// lokale Spiegel angleichen. Nutzer ohne Zugriff (nicht in der Liste) werden
// deaktiviert. Fail-soft: bei nicht erreichbarem Portal wird spaeter erneut
// abgeglichen (naechster Push / naechster Start).
export async function reconcileVonSuite(
  versuche = 10,
  wartenMs = 3000
): Promise<void> {
  for (let i = 0; i < versuche; i++) {
    try {
      await reconcileEinmal();
      return;
    } catch (err) {
      // Netzwerkfehler = Portal beim Start noch nicht bereit -> warten & erneut.
      if (i < versuche - 1) {
        await new Promise((r) => setTimeout(r, wartenMs));
        continue;
      }
      console.error("Provision-Reconcile fehlgeschlagen (fail-soft):", err);
    }
  }
}

async function reconcileEinmal(): Promise<void> {
  const res = await fetch(
    `${SUITE_URL}/api/suite/provision/snapshot?tool=${TOOL_SLUG}`,
    { headers: { "X-Provision-Secret": provisionSecret() } }
  );
  if (!res.ok) {
    // Portal erreichbar, aber Fehler -> nicht endlos wiederholen.
    console.error("Provision-Reconcile: Snapshot-Fehler", res.status);
    return;
  }
  const daten = (await res.json()) as { users: ProvisionUserPayload[] };
  const sollIds = new Set<string>();
  for (const u of daten.users) {
    await applyUpsert(u, "snapshot");
    sollIds.add(u.suiteUserId);
  }
  // Lokale Suite-Nutzer, die nicht mehr in der SOLL-Liste sind -> deaktivieren.
  const lokale = await prisma.benutzer.findMany({
    where: { suiteUserId: { not: null }, aktiv: true },
  });
  for (const b of lokale) {
    if (b.suiteUserId && !sollIds.has(b.suiteUserId)) {
      await prisma.benutzer.update({
        where: { id: b.id },
        data: { aktiv: false },
      });
    }
  }
  console.log(`Provision-Reconcile: ${daten.users.length} Benutzer abgeglichen.`);
}
