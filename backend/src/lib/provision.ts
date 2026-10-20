import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Zentrale User-Provisionierung (Suite -> Tools).
//
// Die Suite ist alleinige Schreibinstanz fuer Benutzer. Jede Aenderung wird pro
// betroffenem Tool als Outbox-Auftrag hinterlegt (provisionUpsert/-Delete) und
// vom Worker (provisionWorker.ts) zuverlaessig zugestellt. Tools spiegeln die
// Benutzer nur noch, schreiben Identitaetsfelder aber nie selbst.
// ---------------------------------------------------------------------------

// Gemeinsames Geheimnis fuer die internen Provisionierungs-Endpunkte der Tools.
// In Produktion Pflicht (wie JWT_SECRET); in Entwicklung Fallback.
export function provisionSecret(): string {
  const s = process.env.PROVISION_SECRET ?? "";
  const istPlatzhalter = /bitte|ersetzen|aendern|changeme|example|platzhalter/i.test(s);
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < 16 || istPlatzhalter) {
      throw new Error(
        "PROVISION_SECRET fehlt oder ist zu kurz (min. 16 Zeichen, identisch in allen Tools)."
      );
    }
  }
  return s || "dev-provision-secret";
}

export interface ProvisionUserPayload {
  suiteUserId: string;
  benutzername: string;
  name: string;
  email: string | null;
  aktiv: boolean;
  rolle: string | null; // Rolle fuer DIESES Tool, null = kein Zugriff
}

// Baut die Nutzlast fuer ein Tool: Identitaet + die fuer DIESES Tool geltende
// Rolle (null, wenn der Benutzer keinen Zugriff (mehr) auf das Tool hat).
async function bauePayload(
  suiteUserId: string,
  toolSlug: string
): Promise<ProvisionUserPayload | null> {
  const user = await prisma.suiteUser.findUnique({
    where: { id: suiteUserId },
    include: { zugriffe: { include: { tool: true } } },
  });
  if (!user) return null;
  const zugriff = user.zugriffe.find((z) => z.tool.slug === toolSlug);
  return {
    suiteUserId: user.id,
    benutzername: user.benutzername,
    name: user.name,
    email: user.email,
    aktiv: user.aktiv,
    rolle: zugriff ? zugriff.rolle : null,
  };
}

// Neuester Stand gewinnt: Jeder Auftrag traegt den VOLLEN Stand (UPSERT) bzw.
// ueberholt alles davor (DELETE). Noch nicht zugestellte, aeltere Auftraege
// desselben Benutzers fuer dasselbe Tool werden daher abgehakt – sonst koennte
// ein spaeter wiederholter alter UPSERT einen juengeren Entzug/Tombstone
// ueberschreiben (Security-Audit 2026-10).
const UEBERHOLT = {
  status: "DONE",
  letzterFehler: "ueberholt durch neueren Auftrag",
} as const;

async function einreihen(
  toolSlug: string,
  suiteUserId: string,
  op: "UPSERT" | "DELETE",
  payload: object
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.provisionOutbox.updateMany({
      where: { toolSlug, suiteUserId, status: "PENDING" },
      data: { ...UEBERHOLT, erledigtAm: new Date() },
    });
    await tx.provisionOutbox.create({ data: { toolSlug, suiteUserId, op, payload } });
  });
}

// Enqueue: UPSERT eines Benutzers an ein bestimmtes Tool (nur Tools mit Backend).
export async function provisionUpsert(
  suiteUserId: string,
  toolSlug: string
): Promise<void> {
  const tool = await prisma.tool.findUnique({ where: { slug: toolSlug } });
  if (!tool?.provisionUrl) return; // kein eigenes Backend -> nichts zu tun
  const payload = await bauePayload(suiteUserId, toolSlug);
  if (!payload) return;
  await einreihen(toolSlug, suiteUserId, "UPSERT", payload as object);
}

// Enqueue: DELETE (Tombstone) eines Benutzers an ein bestimmtes Tool.
export async function provisionDelete(
  suiteUserId: string,
  toolSlug: string,
  benutzername: string
): Promise<void> {
  const tool = await prisma.tool.findUnique({ where: { slug: toolSlug } });
  if (!tool?.provisionUrl) return;
  await einreihen(toolSlug, suiteUserId, "DELETE", { suiteUserId, benutzername });
}

// Enqueue: UPSERT an ALLE Tools (mit Backend), auf die der Benutzer Zugriff hat.
// Fuer Stammdatenaenderungen (Name/E-Mail/aktiv), die alle Tools betreffen.
export async function provisionUpsertAlleTools(
  suiteUserId: string
): Promise<void> {
  const user = await prisma.suiteUser.findUnique({
    where: { id: suiteUserId },
    include: { zugriffe: { include: { tool: true } } },
  });
  if (!user) return;
  for (const z of user.zugriffe) {
    if (z.tool.provisionUrl) await provisionUpsert(suiteUserId, z.tool.slug);
  }
}
