import { prisma } from "./prisma";

// Suite-AuditLog: Logins, Rechteaenderungen, Benutzerverwaltung.
// Nur IDs, keine Klarnamen in den Details (Muster Stunden-Tool).
export async function auditLog(eintrag: {
  userId?: string | null;
  aktion: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: eintrag.userId ?? null,
        aktion: eintrag.aktion,
        details: (eintrag.details ?? undefined) as object | undefined,
      },
    });
  } catch (err) {
    // Audit darf die eigentliche Aktion nie blockieren.
    console.error("AuditLog fehlgeschlagen:", err);
  }
}
