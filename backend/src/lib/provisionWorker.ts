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

async function stelleZu(): Promise<void> {
  const auftraege = await prisma.provisionOutbox.findMany({
    where: { status: "PENDING" },
    orderBy: { erstelltAm: "asc" },
    take: STAPEL,
  });

  for (const a of auftraege) {
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
          ? `${basis}/api/provision/user/${a.suiteUserId}`
          : `${basis}/api/provision/user`;
      const res = await fetch(url, {
        method: a.op === "DELETE" ? "DELETE" : "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Provision-Secret": provisionSecret(),
        },
        body: a.op === "DELETE" ? undefined : JSON.stringify(a.payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await prisma.provisionOutbox.update({
        where: { id: a.id },
        data: { status: "DONE", erledigtAm: new Date() },
      });
    } catch (err) {
      const versuche = a.versuche + 1;
      const status = versuche >= MAX_VERSUCHE ? "FEHLER" : "PENDING";
      await prisma.provisionOutbox.update({
        where: { id: a.id },
        data: { versuche, status, letzterFehler: String(err) },
      });
    }
  }
}

export function starteProvisionWorker(): void {
  setInterval(() => {
    stelleZu().catch((e) => console.error("Provision-Worker-Fehler:", e));
  }, INTERVALL_MS);
}
