import { prisma } from "./prisma";
import { SUITE_URL, TOOL_SLUG } from "./suiteAuth";

// ---------------------------------------------------------------------------
// Empfangsseite der zentralen User-Provisionierung (Suite -> dieses Tool).
//
// Die Suite ist alleinige Schreibinstanz fuer Benutzer. Dieses Tool spiegelt
// sie nur (lokale User-Zeile fuer Audit-/erfasstVon-Referenzen). Identitaet
// kommt IMMER von der Suite.
// ---------------------------------------------------------------------------

const FQ_ROLLEN = ["nutzer"] as const;
type FqRolle = (typeof FQ_ROLLEN)[number];

export interface ProvisionUserPayload {
  suiteUserId: string;
  benutzername: string;
  name: string;
  email: string | null;
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
export async function applyUpsert(p: ProvisionUserPayload): Promise<void> {
  const gueltig = FQ_ROLLEN.includes((p.rolle ?? "") as FqRolle);
  // Einzige Tool-Rolle ist NUTZER; ohne gueltige Rolle -> gesperrt.
  const rolle = "NUTZER" as const;
  const aktiv = p.aktiv && gueltig;

  const vorhanden = await prisma.user.findUnique({
    where: { suiteUserId: p.suiteUserId },
  });
  if (vorhanden) {
    await prisma.user.update({
      where: { id: vorhanden.id },
      data: { name: p.name, email: p.email, rolle, aktiv, geloescht: false },
    });
    return;
  }

  await prisma.user.create({
    data: {
      suiteUserId: p.suiteUserId,
      email: p.email,
      name: p.name,
      rolle,
      aktiv,
      geloescht: false,
    },
  });
}

// Tombstone: sperrt den Benutzer, erhaelt aber die Historie.
export async function applyDelete(suiteUserId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { suiteUserId },
    data: { aktiv: false, geloescht: true },
  });
}

// Startup-Abgleich (Self-Heal): vollstaendige SOLL-Liste vom Portal holen und
// lokale Spiegel angleichen. Nutzer ohne Zugriff (nicht in der Liste) werden
// deaktiviert. Fail-soft bei nicht erreichbarem Portal.
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
    await applyUpsert(u);
    sollIds.add(u.suiteUserId);
  }
  const lokale = await prisma.user.findMany({
    where: { suiteUserId: { not: null }, aktiv: true },
  });
  for (const u of lokale) {
    if (u.suiteUserId && !sollIds.has(u.suiteUserId)) {
      await prisma.user.update({
        where: { id: u.id },
        data: { aktiv: false },
      });
    }
  }
  console.log(`Provision-Reconcile: ${daten.users.length} Benutzer abgeglichen.`);
}
