import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { prisma } from "../lib/db.js";
import { UPLOAD_DIR } from "../lib/uploads.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis, type Agent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Kleinste gültige PNG-Signatur reicht: der Upload prüft nur den MIME-Typ.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

// Binäre Antwort (ZIP) als Buffer einsammeln.
function binaer(res: any, cb: (err: Error | null, body: unknown) => void) {
  const teile: Buffer[] = [];
  res.on("data", (c: Buffer) => teile.push(c));
  res.on("end", () => cb(null, Buffer.concat(teile)));
}

run("BMD-Export: CSV und ZIP mit Belegen (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;
  let finanzen: Agent;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
    await prisma.kostenstelle.update({ where: { id: basis.ksA }, data: { gegenkonto: "99950" } });
    erfasser = await alsAgent("erfasser");
    finanzen = await alsAgent("finanzen");
  });

  async function buchungMitBeleg(): Promise<{ belegnummer: string; datei: string }> {
    const up = await erfasser
      .post("/api/buchungen/belege")
      .attach("datei", PNG, { filename: "IMG 0001.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const b = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { belegId: up.body.belegId, beschreibung: "Netzteil" }));
    expect(b.status).toBe(201);
    const beleg = await prisma.beleg.findUniqueOrThrow({ where: { id: up.body.belegId } });
    return { belegnummer: b.body.belegnummer, datei: beleg.dateipfad };
  }

  it("CSV: Semikolon, Kopfzeile wie vorgegeben, dokument = Dateiname des Belegs", async () => {
    const { belegnummer, datei } = await buchungMitBeleg();
    expect(datei).toBe(`${belegnummer}.png`);
    await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { typ: "eingang", betragCent: 25000, positionen: [{ betragCent: 25000, steuersatz: 0, kontoId: basis.kontoId }] }));

    const r = await finanzen.get("/api/export/bmd?jahr=2026&monat=5");
    expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toContain('filename="bmd_ka_2026_05.csv"');
    const zeilen = r.text.trim().split("\r\n");
    expect(zeilen[0].split(";")).toHaveLength(14);
    expect(zeilen[0]).toMatch(/;buchsymbol;dokument$/);
    expect(zeilen[1]).toBe(`0;50000;99950;20260515;${belegnummer};1000;20;2;1;8,33;1,67;Netzteil;KA;${datei}`);
    expect(zeilen[2]).toMatch(/^0;50000;99950;20260515;2026-1000-02;1000;0;1;2;250,00;0,00;;KA;$/);
  });

  it("ZIP: enthält die CSV und jede Belegdatei unter genau dem Namen aus der CSV", async () => {
    const { datei } = await buchungMitBeleg();
    const csv = await finanzen.get("/api/export/bmd?jahr=2026&monat=5");

    const r = await finanzen.get("/api/export/bmd-zip?jahr=2026&monat=5").buffer(true).parse(binaer);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/zip");
    const inhalt = unzipSync(new Uint8Array(r.body as Buffer));
    expect(Object.keys(inhalt).sort()).toEqual(["bmd_ka_2026_05.csv", datei].sort());
    expect(strFromU8(inhalt["bmd_ka_2026_05.csv"], true)).toBe(csv.text);
    expect(Buffer.from(inhalt[datei]).equals(PNG)).toBe(true);
  });

  it("fehlende Belegdatei: dokument leer, Hinweisdatei im ZIP", async () => {
    const { belegnummer, datei } = await buchungMitBeleg();
    fs.unlinkSync(path.join(UPLOAD_DIR, datei));

    const csv = await finanzen.get("/api/export/bmd?jahr=2026&monat=5");
    expect(csv.text.trim().split("\r\n")[1]).toMatch(/;KA;$/);

    const r = await finanzen.get("/api/export/bmd-zip?jahr=2026&monat=5").buffer(true).parse(binaer);
    const inhalt = unzipSync(new Uint8Array(r.body as Buffer));
    expect(Object.keys(inhalt).sort()).toEqual(["FEHLENDE_BELEGE.txt", "bmd_ka_2026_05.csv"]);
    expect(strFromU8(inhalt["FEHLENDE_BELEGE.txt"])).toContain(belegnummer);
  });

  it("nur Finanzen/Admin; ungültiger Monat -> 400; fehlendes Gegenkonto -> 400", async () => {
    expect((await erfasser.get("/api/export/bmd-zip?jahr=2026&monat=5")).status).toBe(403);
    expect((await finanzen.get("/api/export/bmd-zip?jahr=2026&monat=13")).status).toBe(400);
    await buchungMitBeleg();
    await prisma.kostenstelle.update({ where: { id: basis.ksA }, data: { gegenkonto: null } });
    const r = await finanzen.get("/api/export/bmd-zip?jahr=2026&monat=5");
    expect(r.status).toBe(400);
    expect(r.body.fehler).toContain("Gegenkonto");
  });
});
