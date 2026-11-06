import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db.js";
import { UPLOAD_DIR } from "../lib/uploads.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis, type Agent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Key-User-Feedback 2026-11, Punkt 3: Löschen in offener Periode, frei gewordene
// Belegnummern nur im selben Monat wiederverwenden (niedrigste zuerst).
run("Buchungen löschen und Belegnummern wiederverwenden (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
    erfasser = await alsAgent("erfasser");
  });

  async function buchen(datum = "2026-05-15", betragCent = 1000) {
    const r = await erfasser.post("/api/buchungen").send(
      buchungEingabe(basis.ksA, basis.kontoId, {
        belegdatum: datum,
        betragCent,
        positionen: [{ betragCent, steuersatz: 20, kontoId: basis.kontoId }],
      })
    );
    expect(r.status).toBe(201);
    return r.body as { id: number; belegnummer: string };
  }
  const loeschen = (id: number, agent: Agent = erfasser) => agent.delete(`/api/buchungen/${id}`);
  const saldo = async () => (await prisma.kostenstelle.findUniqueOrThrow({ where: { id: basis.ksA } })).saldoCent;

  it("löscht, stellt den Saldo wieder her, protokolliert und vergibt die Nummer neu", async () => {
    const b1 = await buchen();
    const b2 = await buchen("2026-05-16", 2500);
    await buchen();
    const saldoVorher = await saldo();

    const r = await loeschen(b2.id);
    expect(r.status).toBe(200);
    expect(r.body.freieBelegnummer).toBe("2026-1000-02");
    expect(await prisma.buchung.findUnique({ where: { id: b2.id } })).toBeNull();
    expect(await saldo()).toBe(saldoVorher + 2500);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { aktion: "buchung.geloescht" } });
    expect(log.entitaetId).toBe(b2.id);
    expect(log.benutzerId).toBe(basis.benutzer.erfasserA);
    expect((log.alteWerte as { belegnummer: string }).belegnummer).toBe("2026-1000-02");

    const frei = await erfasser.get(`/api/buchungen/freie-belegnummern?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    expect(frei.body.map((f: { belegnummer: string }) => f.belegnummer)).toEqual(["2026-1000-02"]);
    const vorschau = await erfasser.get(`/api/buchungen/naechste-belegnummer?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    expect(vorschau.body.belegnummer).toBe("2026-1000-02");

    expect((await buchen()).belegnummer).toBe("2026-1000-02");
    expect((await buchen()).belegnummer).toBe("2026-1000-04");
    expect(b1.belegnummer).toBe("2026-1000-01");
    expect(await prisma.freieBelegnummer.count()).toBe(0);
  });

  it("vergibt mehrere frei gewordene Nummern der Reihe nach, niedrigste zuerst", async () => {
    const b = [await buchen(), await buchen(), await buchen(), await buchen()];
    await loeschen(b[2].id);
    await loeschen(b[0].id);
    expect((await buchen()).belegnummer).toBe("2026-1000-01");
    expect((await buchen()).belegnummer).toBe("2026-1000-03");
    expect((await buchen()).belegnummer).toBe("2026-1000-05");
  });

  it("verwendet frei gewordene Nummern nie über die Monatsgrenze", async () => {
    // Juni wie den Mai (seedBasis) ausdrücklich entsperren
    await prisma.monatsSperre.create({ data: { kostenstelleId: basis.ksA, jahr: 2026, monat: 6, gesperrt: false } });
    await buchen("2026-05-10");
    const mai2 = await buchen("2026-05-20");
    await loeschen(mai2.id); // höchste Nummer im Mai wird frei

    // Juni bekommt NICHT die Mai-Nummer 02, sondern 03
    expect((await buchen("2026-06-02")).belegnummer).toBe("2026-1000-03");
    // Die 02 bleibt für den Mai offen ...
    const frei = await erfasser.get(`/api/buchungen/freie-belegnummern?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    expect(frei.body).toHaveLength(1);
    // ... und wird von der nächsten Mai-Buchung genutzt
    expect((await buchen("2026-05-28")).belegnummer).toBe("2026-1000-02");
  });

  it("Export-Hinweis listet offene Nummern über alle Kostenstellen (nur Finanzen/Admin)", async () => {
    const b = await buchen();
    await buchen();
    await loeschen(b.id);
    const finanzen = await alsAgent("finanzen");
    const r = await finanzen.get("/api/export/freie-belegnummern?firma=1&jahr=2026&monat=5");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ belegnummer: "2026-1000-01", kostenstelle: { nummer: "1000", bezeichnung: "KS A" } }]);
    expect((await finanzen.get("/api/export/freie-belegnummern?firma=1&jahr=2026&monat=6")).body).toEqual([]);
    expect((await erfasser.get("/api/export/freie-belegnummern?firma=1&jahr=2026&monat=5")).status).toBe(403);
  });

  it("entfernt die Belegdatei und den Beleg-Datensatz", async () => {
    const up = await erfasser
      .post("/api/buchungen/belege")
      .attach("datei", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]), { filename: "x.png", contentType: "image/png" });
    const r = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegId: up.body.belegId }));
    const beleg = await prisma.beleg.findUniqueOrThrow({ where: { id: up.body.belegId } });
    const datei = path.join(UPLOAD_DIR, beleg.dateipfad);
    expect(fs.existsSync(datei)).toBe(true);

    expect((await loeschen(r.body.id)).status).toBe(200);
    expect(fs.existsSync(datei)).toBe(false);
    expect(await prisma.beleg.count()).toBe(0);
  });

  it("stornierte Buchung löschen ändert den Saldo nicht erneut", async () => {
    const b = await buchen();
    await erfasser.post(`/api/buchungen/${b.id}/storno`);
    const nachStorno = await saldo();
    expect((await loeschen(b.id)).status).toBe(200);
    expect(await saldo()).toBe(nachStorno);
  });

  it("verweigert das Löschen in freigegebenen/gesperrten Perioden und ohne Zugriff", async () => {
    const b = await buchen();

    const sperre = { kostenstelleId_jahr_monat: { kostenstelleId: basis.ksA, jahr: 2026, monat: 5 } };
    await prisma.monatsSperre.update({ where: sperre, data: { gesperrt: true } });
    expect((await loeschen(b.id)).status).toBe(409);
    await prisma.monatsSperre.update({ where: sperre, data: { gesperrt: false } });

    await prisma.abschluss.create({
      data: { kostenstelleId: basis.ksA, jahr: 2026, monat: 5, zaehllisteCent: 0, status: "freigegeben", freigegebenAm: new Date() },
    });
    expect((await loeschen(b.id, await alsAgent("admin"))).status).toBe(409);
    await prisma.abschluss.deleteMany();

    const fremd = await prisma.buchung.update({ where: { id: b.id }, data: { kostenstelleId: basis.ksB } });
    expect((await loeschen(fremd.id)).status).toBe(403);
    expect((await loeschen(999999)).status).toBe(404);
    expect(await prisma.buchung.count()).toBe(1);
  });

  it("vergibt bei gleichzeitigen Buchungen keine Nummer doppelt", async () => {
    const antworten = await Promise.all(
      Array.from({ length: 8 }, () =>
        erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId))
      )
    );
    expect(antworten.map((r) => r.status)).toEqual(Array(8).fill(201));
    const nummern = antworten.map((r) => r.body.belegnummer).sort();
    expect(new Set(nummern).size).toBe(8);
    expect(nummern[7]).toBe("2026-1000-08");
  });
});
