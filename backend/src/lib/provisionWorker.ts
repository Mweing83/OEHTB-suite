import { prisma } from "./prisma";
import { provisionSecret } from "./provision";

// ---------------------------------------------------------------------------
// Outbox-Worker: stellt Provisionierungs-Auftraege zuverlaessig an die Tools zu.
//
// Laeuft im Portal-Prozess in einem Intervall. Erfolgreiche Auftraege werden
// als DONE markiert, fehlgeschlagene erneut versucht (bis MAX_VERSUCHE, dann
// FEHLER – die Startup-Reconcile-Routine der Tools holt solche Aenderungen
// spaetestens beim naechsten Tool-Neustart nach). Liveness-Optimierung; die
// Korrektheit garantiert der Snapshot-Abgleich der Tools.
// ---------------------------------------------------------------------------

const INTERVALL_MS = 10_000;
const MAX_VERSUCHE = 30; // ~5 Minuten Zustellversuche, ueberdauert Tool-Neustarts
const STAPEL = 20;

const TIMEOUT_MS = 15_000;
let laeuft = false;

// Ein Durchlauf. Exportiert fuer Tests.
export async function stelleZu(): Promise<void> {
  if (laeuft) return; // kein ueberlappender Durchlauf (langsame Tools)
  laeuft = true;
  try {
    const auftraege = await prisma.provisionOutbox.findMany({
      where: { status: "PENDING" },
      orderBy: { erstelltAm: "asc" },
      take: STAPEL,
    });

    // Benutzer/Tool-Paare, deren aelterer Auftrag in diesem Durchlauf
    // scheiterte: juengere Auftraege desselben Paares duerfen ihn nicht
    // ueberholen (Reihenfolge je Benutzer bleibt erhalten).
    const gescheitert = new Set<string>();

    for (const a of auftraege) {
      const schluessel = `${a.toolSlug}:${a.suiteUserId}`;
      if (gescheitert.has(schluessel)) continue;

      const tool = await prisma.tool.findUnique({ where: { slug: a.toolSlug } });
      if (!tool?.provisionUrl) {
        // Kein Ziel (Tool entfernt / ohne Backend) -> als erledigt abhaken.
        await prisma.provisionOutbox.update({
          where: { id: a.id },
          data: { status: "DONE", erledigtAm: new Date() },
        });
        continue;
      }

      try {
        const basis = tool.provisionUrl.replace(/\/$/, "");
        const url =
          a.op === "DELETE"
            ? `${basis}/api/provision/user/${encodeURIComponent(a.suiteUserId)}`
            : `${basis}/api/provision/user`;
        const res = await fetch(url, {
          method: a.op === "DELETE" ? "DELETE" : "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Provision-Secret": provisionSecret(),
          },
          // Auch DELETE traegt die Nutzlast (benutzername), damit das Tool fuer
          // einen ihm unbekannten Benutzer einen dauerhaften Tombstone anlegt.
          body: JSON.stringify(a.payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await prisma.provisionOutbox.update({
          where: { id: a.id },
          data: { status: "DONE", erledigtAm: new Date() },
        });
      } catch (err) {
        gescheitert.add(schluessel);
        const versuche = a.versuche + 1;
        const status = versuche >= MAX_VERSUCHE ? "FEHLER" : "PENDING";
        await prisma.provisionOutbox.update({
          where: { id: a.id },
          data: { versuche, status, letzterFehler: String(err) },
        });
      }
    }
  } finally {
    laeuft = false;
  }
}

export function starteProvisionWorker(): void {
  setInterval(() => {
    stelleZu().catch((e) => console.error("Provision-Worker-Fehler:", e));
  }, INTERVALL_MS);
}
