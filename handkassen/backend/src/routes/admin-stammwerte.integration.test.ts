import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, type Basis, type Agent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Verwaltung der einfachen Stammwerte (Bereiche, Kassenarten) und der
// "aktiv"-Schalter aller Stammdaten. Bereiche und Kassenarten verhalten sich
// gleich und laufen über denselben Code.
run("Verwaltung: Stammwerte und aktiv-Schalter (Integration)", () => {
  let basis: Basis;
  let admin: Agent;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
    admin = await alsAgent("admin");
  });

  for (const [pfad, entitaet, doppeltMeldung] of [
    ["bereiche", "bereich", "Dieser Bereich existiert bereits."],
    ["kassenarten", "kassenart", "Diese Art existiert bereits."],
  ] as const) {
    it(`${pfad}: anlegen, umbenennen, Dubletten ablehnen, deaktivieren`, async () => {
      const neu = await admin.post(`/api/admin/${pfad}`).send({ bezeichnung: "Neu" });
      expect(neu.status).toBe(201);
      expect(neu.body).toMatchObject({ bezeichnung: "Neu", aktiv: true });

      const doppelt = await admin.post(`/api/admin/${pfad}`).send({ bezeichnung: "Neu" });
      expect(doppelt.status).toBe(409);
      expect(doppelt.body.fehler).toBe(doppeltMeldung);
      expect((await admin.post(`/api/admin/${pfad}`).send({ bezeichnung: "" })).status).toBe(400);

      const zweiter = await admin.post(`/api/admin/${pfad}`).send({ bezeichnung: "Zweiter" });
      const kollision = await admin.put(`/api/admin/${pfad}/${zweiter.body.id}`).send({ bezeichnung: "Neu" });
      expect(kollision.status).toBe(409);
      const umbenannt = await admin.put(`/api/admin/${pfad}/${zweiter.body.id}`).send({ bezeichnung: "Anders" });
      expect(umbenannt.body.bezeichnung).toBe("Anders");
      // Unveränderte Bezeichnung erneut speichern ist erlaubt (keine Kollision mit sich selbst).
      expect((await admin.put(`/api/admin/${pfad}/${zweiter.body.id}`).send({ bezeichnung: "Anders" })).status).toBe(200);

      const aus = await admin.post(`/api/admin/${pfad}/${neu.body.id}/aktiv`).send({ aktiv: false });
      expect(aus.body).toEqual({ id: neu.body.id, aktiv: false });
      const liste = await admin.get(`/api/admin/${pfad}`);
      expect(liste.body.find((e: { id: number }) => e.id === neu.body.id).aktiv).toBe(false);
      // sortiert nach Bezeichnung
      const namen = liste.body.map((e: { bezeichnung: string }) => e.bezeichnung);
      expect(namen).toEqual([...namen].sort((a, b) => a.localeCompare(b)));

      const aktionen = (await prisma.auditLog.findMany({ where: { entitaet }, orderBy: { id: "asc" } })).map((a) => a.aktion);
      expect(aktionen).toEqual([
        `${entitaet}.erstellt`,
        `${entitaet}.erstellt`,
        `${entitaet}.bearbeitet`,
        `${entitaet}.bearbeitet`,
        `${entitaet}.deaktiviert`,
      ]);
    });
  }

  it("aktiv-Schalter für Kostenstelle, Konto und Steuersatz samt Audit-Eintrag", async () => {
    const satz = await prisma.steuersatz.findFirstOrThrow();
    for (const [pfad, entitaet, id] of [
      ["kostenstellen", "kostenstelle", basis.ksB],
      ["konten", "konto", basis.kontoId],
      ["steuersaetze", "steuersatz", satz.id],
    ] as const) {
      const aus = await admin.post(`/api/admin/${pfad}/${id}/aktiv`).send({ aktiv: false });
      expect(aus.body).toEqual({ id, aktiv: false });
      const an = await admin.post(`/api/admin/${pfad}/${id}/aktiv`).send({ aktiv: true });
      expect(an.body).toEqual({ id, aktiv: true });
      const aktionen = (
        await prisma.auditLog.findMany({ where: { entitaet, entitaetId: id }, orderBy: { id: "asc" } })
      ).map((a) => a.aktion);
      expect(aktionen).toEqual([`${entitaet}.deaktiviert`, `${entitaet}.aktiviert`]);
    }
  });

  it("nur Admins dürfen Stammwerte ändern", async () => {
    const finanzen = await alsAgent("finanzen");
    expect((await finanzen.post("/api/admin/bereiche").send({ bezeichnung: "x" })).status).toBe(403);
    expect((await finanzen.post(`/api/admin/konten/${basis.kontoId}/aktiv`).send({ aktiv: false })).status).toBe(403);
  });
});
