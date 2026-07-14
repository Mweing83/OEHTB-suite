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

// Enqueue: UPSERT eines Benutzers an ein bestimmtes Tool (nur Tools mit Backend).
export async function provisionUpsert(
  suiteUserId: string,
  toolSlug: string
): Promise<void> {
  const tool = await prisma.tool.findUnique({ where: { slug: toolSlug } });
  if (!tool?.provisionUrl) return; // kein eigenes Backend -> nichts zu tun
  const payload = await bauePayload(suiteUserId, toolSlug);
  if (!payload) return;
  await prisma.provisionOutbox.create({
    data: {
      toolSlug,
      suiteUserId,
      op: "UPSERT",
      payload: payload as object,
    },
  });
}

// Enqueue: DELETE (Tombstone) eines Benutzers an ein bestimmtes Tool.
export async function provisionDelete(
  suiteUserId: string,
  toolSlug: string,
  benutzername: string
): Promise<void> {
  const tool = await prisma.tool.findUnique({ where: { slug: toolSlug } });
  if (!tool?.provisionUrl) return;
  await prisma.provisionOutbox.create({
    data: {
      toolSlug,
      suiteUserId,
      op: "DELETE",
      payload: { suiteUserId, benutzername } as object,
    },
  });
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
