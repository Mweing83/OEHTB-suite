import { prisma } from "./prisma";

// Schreibt einen AuditLog-Eintrag. Bewusst ohne Klarnamen – nur IDs,
// damit das Log selbst keine zusaetzlichen Personendaten enthaelt.
export async function auditLog(params: {
  userId?: string | null;
  aktion: string;
  betroffenerMitarbeiterId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        aktion: params.aktion,
        betroffenerMitarbeiterId: params.betroffenerMitarbeiterId ?? null,
        details: (params.details ?? undefined) as object | undefined,
      },
    });
  } catch (err) {
    // AuditLog darf den eigentlichen Vorgang nie blockieren.
    console.error("AuditLog konnte nicht geschrieben werden:", err);
  }
}
