import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis, type Agent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Key-User-Feedback 2026-11: Splitbuchung mit Text je Buchungszeile; Exporte
// geben jede Buchungszeile als eigene Zeile aus (Beispiel Beleg 2160-859:
// 3,15 € Lebensmittel zu 4,9 % und 11,85 € Taschentücher zu 20 %).
run("Splitbuchung: Text je Zeile und Export je Buchungszeile (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;
  let konto2: number;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
    await prisma.steuersatz.create({ data: { prozent: 4.9, bezeichnung: "4,9 %" } });
    const ks = await prisma.kostenstelle.update({ where: { id: basis.ksA }, data: { gegenkonto: "99950" } });
    const k = await prisma.konto.create({
      data: { nummer: "76000", bezeichnung: "Hygiene", bereiche: { create: { bereichId: ks.bereichId } } },
    });
    konto2 = k.id;
    erfasser = await alsAgent("erfasser");
  });

  const split = (texte: [string | undefined, string | undefined]) =>
    buchungEingabe(basis.ksA, basis.kontoId, {
      belegdatum: "2026-05-02",
      betragCent: 1500,
      beschreibung: undefined,
      positionen: [
        { betragCent: 315, steuersatz: 4.9, kontoId: basis.kontoId, text: texte[0] },
        { betragCent: 1185, steuersatz: 20, kontoId: konto2, text: texte[1] },
      ],
    });

  it("verlangt bei Splitbuchungen einen Text je Zeile", async () => {
    const r = await erfasser.post("/api/buchungen").send(split(["Lebensmittel", " "]));
    expect(r.status).toBe(400);
    expect(String(r.body.fehler)).toContain("Position 2: Beschreibung");
  });

  it("speichert die Zeilentexte und bildet daraus die Buchungsbeschreibung", async () => {
    const r = await erfasser.post("/api/buchungen").send(split(["Lebensmittel", "Taschentücher"]));
    expect(r.status).toBe(201);
    const b = await prisma.buchung.findUniqueOrThrow({
      where: { id: r.body.id },
      include: { positionen: { orderBy: { id: "asc" } } },
    });
    expect(b.beschreibung).toBe("Lebensmittel / Taschentücher");
    expect(b.positionen.map((p) => p.text)).toEqual(["Lebensmittel", "Taschentücher"]);

    // Einfache Buchung: kein Zeilentext, es gilt die Buchungsbeschreibung
    const einfach = await erfasser
      .post("/api/buchungen")
      .send(buchungEingabe(basis.ksA, basis.kontoId, { positionen: [{ betragCent: 1000, steuersatz: 20, kontoId: basis.kontoId, text: "x" }] }));
    const p = await prisma.buchungsPosition.findFirstOrThrow({ where: { buchungId: einfach.body.id } });
    expect(p.text).toBeNull();
  });

  it("CSV je Kostenstelle: eine Zeile je Buchungszeile, Summe = Belegbetrag", async () => {
    const r = await erfasser.post("/api/buchungen").send(split(["Lebensmittel", "Taschentücher"]));
    const csv = await erfasser.get(`/api/berichte/csv?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    expect(csv.status).toBe(200);
    const zeilen = csv.text.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0]).toBe("Nr.;Belegnummer;Belegdatum;Typ;Beschreibung;Konto;MwSt_EUR;Betrag_EUR");
    const nr = `${r.body.buchungsnummer};${r.body.belegnummer};02.05.2026;Ausgang`;
    expect(zeilen[1]).toBe(`${nr};Lebensmittel;50000 (4.9%);0,15;-3,15`);
    expect(zeilen[2]).toBe(`${nr};Taschentücher;76000 (20%);1,98;-11,85`);
  });

  it("CSV über alle Kassen und BMD-Export: je Buchungszeile eine Satzzeile", async () => {
    const r = await erfasser.post("/api/buchungen").send(split(["Lebensmittel", "Taschentücher"]));
    const finanzen = await alsAgent("finanzen");

    const alle = (await finanzen.get("/api/export/csv?firma=1&jahr=2026&monat=5")).text.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(alle).toHaveLength(3);
    expect(alle[1]).toMatch(/;Lebensmittel;50000 \(4\.9%\);0,15;-3,15$/);
    expect(alle[2]).toMatch(/;Taschentücher;76000 \(20%\);1,98;-11,85$/);

    // BMD-Datei ist Latin-1 kodiert: als Bytes holen und so dekodieren.
    const roh = await finanzen
      .get("/api/export/bmd?firma=1&jahr=2026&monat=5")
      .buffer(true)
      .parse((res, cb) => {
        const teile: Buffer[] = [];
        res.on("data", (c: Buffer) => teile.push(c));
        res.on("end", () => cb(null, Buffer.concat(teile)));
      });
    const bmd = (roh.body as Buffer).toString("latin1").trim().split("\r\n");
    expect(bmd).toHaveLength(3);
    // gleiche Belegnummer, eigenes Konto/Satz/Netto/Steuer/Text; netto + steuer = brutto
    expect(bmd[1]).toBe(`0;50000;99950;20260502;${r.body.belegnummer};1000;4,9;2;1;3,00;0,15;Lebensmittel;KA;`);
    expect(bmd[2]).toBe(`0;76000;99950;20260502;${r.body.belegnummer};1000;20;2;1;9,87;1,98;Taschentücher;KA;`);
  });
});
