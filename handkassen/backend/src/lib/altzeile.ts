import type { Rolle } from "@prisma/client";
import { prisma } from "./db.js";

// ---------------------------------------------------------------------------
// Uebernahme einer unverknuepften, gleichnamigen Bestandszeile (aus der Zeit
// vor dem Suite-Login) durch einen Suite-Benutzer.
//
// Die Verknuepfung ueber den Benutzernamen bleibt noetig: der Benutzername ist
// lokal eindeutig (eine neue Zeile wuerde kollidieren), und Buchungen/Audit-
// Historie sollen bei derselben Person bleiben.
//
// Sicher gemacht (Security-Audit 2026-10): Ein gleicher Name beweist nicht,
// dass es dieselbe Person ist. Daher werden die Kostenstellen-Freischaltungen
// der Altzeile entfernt – der Handkassen-Admin vergibt sie bewusst neu – und
// die Uebernahme wird im Audit-Log festgehalten.
// ---------------------------------------------------------------------------
export async function altzeileUebernehmen(
  altzeile: { id: number; benutzername: string; aktiv: boolean },
  neu: {
    suiteUserId: string;
    name: string;
    rolle: Rolle;
    aktiv: boolean;
    geloescht?: boolean;
  },
  quelle: "anmeldung" | "provisionierung"
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entfernt = await tx.benutzerKostenstelle.findMany({
      where: { benutzerId: altzeile.id },
      select: { kostenstelleId: true },
    });
    await tx.benutzerKostenstelle.deleteMany({ where: { benutzerId: altzeile.id } });
    await tx.benutzer.update({
      where: { id: altzeile.id },
      data: {
        suiteUserId: neu.suiteUserId,
        name: neu.name,
        rolle: neu.rolle,
        aktiv: neu.aktiv,
        ...(neu.geloescht !== undefined ? { geloescht: neu.geloescht } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        benutzerId: altzeile.id,
        aktion: "benutzer.altzeile_verknuepft",
        entitaet: "benutzer",
        entitaetId: altzeile.id,
        alteWerte: {
          aktiv: altzeile.aktiv,
          kostenstellen: entfernt.map((e) => e.kostenstelleId),
        },
        neueWerte: { suiteUserId: neu.suiteUserId, aktiv: neu.aktiv, quelle },
      },
    });
  });
  console.warn(
    `Handkassen: Bestandszeile '${altzeile.benutzername}' mit Suite-Benutzer verknuepft (${quelle}); ` +
      "Kostenstellen-Freischaltungen entfernt – bitte in der Administration neu zuweisen."
  );
}
