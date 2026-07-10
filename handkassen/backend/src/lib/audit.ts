import { prisma } from "./db.js";

// Schreibt einen revisionssicheren Eintrag. Wird nur angehängt, nie verändert.
export async function audit(params: {
  benutzerId?: number | null;
  aktion: string;
  entitaet: string;
  entitaetId?: number | null;
  alteWerte?: unknown;
  neueWerte?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      benutzerId: params.benutzerId ?? null,
      aktion: params.aktion,
      entitaet: params.entitaet,
      entitaetId: params.entitaetId ?? null,
      alteWerte: params.alteWerte === undefined ? undefined : (params.alteWerte as any),
      neueWerte: params.neueWerte === undefined ? undefined : (params.neueWerte as any),
    },
  });
}
