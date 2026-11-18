import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../lib/db.js";
import { resetDb, seedBasis, alsAgent, buchungEingabe, type Basis, type Agent } from "../test/helfer.js";

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Key-User-Feedback 2026-11: Einnahmen innerhalb einer Splitbuchung und
// NTCS-Export je Firma oder je Kostenstelle. Beispiel Rechnung von Hofer:
// Lebensmittel 10,00 (Ausgabe) + Getränke 20,00 (Ausgabe) − Pfand retour 5,00
// (Einnahme) = 25,00 € bezahlt.
run("Splitbuchung mit Einnahme-Zeilen und Export je Kostenstelle (Integration)", () => {
  let basis: Basis;
  let erfasser: Agent;

  beforeEach(async () => {
    await resetDb();
    basis = await seedBasis();
    await prisma.kostenstelle.updateMany({ data: { gegenkonto: "99950" } });
    erfasser = await alsAgent("erfasser");
  });

  const hofer = (betragCent = 2500) =>
    buchungEingabe(basis.ksA, basis.kontoId, {
      belegdatum: "2026-05-04",
      betragCent,
      beschreibung: undefined,
      positionen: [
        { betragCent: 1000, steuersatz: 10, kontoId: basis.kontoId, text: "Lebensmittel", typ: "ausgang" },
        { betragCent: 2000, steuersatz: 20, kontoId: basis.kontoId, text: "Getränke", typ: "ausgang" },
        { betragCent: 500, steuersatz: 20, kontoId: basis.kontoId, text: "Pfand retour", typ: "eingang" },
      ],
    });

  async function binaerLatin1(agent: Agent, url: string): Promise<string[]> {
    const r = await agent
      .get(url)
      .buffer(true)
      .parse((res, cb) => {
        const teile: Buffer[] = [];
        res.on("data", (c: Buffer) => teile.push(c));
        res.on("end", () => cb(null, Buffer.concat(teile)));
      });
    return (r.body as Buffer).toString("latin1").trim().split("\r\n");
  }

  it("rechnet Ausgaben plus, Einnahmen minus; Gesamtbetrag = bezahlter Betrag", async () => {
    const saldoVorher = (await prisma.kostenstelle.findUniqueOrThrow({ where: { id: basis.ksA } })).saldoCent;
    expect((await erfasser.post("/api/buchungen").send(hofer(3500))).status).toBe(400); // 10+20+5 wäre falsch
    const r = await erfasser.post("/api/buchungen").send(hofer());
    expect(r.status).toBe(201);
    const pos = await prisma.buchungsPosition.findMany({ where: { buchungId: r.body.id }, orderBy: { id: "asc" } });
    expect(pos.map((p) => p.typ)).toEqual(["ausgang", "ausgang", "eingang"]);
    const saldoNachher = (await prisma.kostenstelle.findUniqueOrThrow({ where: { id: basis.ksA } })).saldoCent;
    expect(saldoNachher).toBe(saldoVorher - 2500);
  });

  it("Excel-CSV: Typ und Vorzeichen je Zeile; Summe = −25,00", async () => {
    await erfasser.post("/api/buchungen").send(hofer());
    const csv = await erfasser.get(`/api/berichte/csv?kostenstelle=${basis.ksA}&jahr=2026&monat=5`);
    const zeilen = csv.text.replace(/^\uFEFF/, "").trim().split("\r\n").slice(1);
    expect(zeilen.map((z) => z.split(";").slice(3).join(";"))).toEqual([
      "Ausgang;Lebensmittel;50000 (10%);0,91;-10,00",
      "Ausgang;Getränke;50000 (20%);3,33;-20,00",
      "Eingang;Pfand retour;50000 (20%);0,83;5,00",
    ]);
  });

  it("BMD/NTCS: je Zeile eigener Buchungs- und Steuercode, gleiche Belegnummer", async () => {
    const r = await erfasser.post("/api/buchungen").send(hofer());
    const finanzen = await alsAgent("finanzen");
    const bmd = await binaerLatin1(finanzen, "/api/export/bmd?firma=1&jahr=2026&monat=5");
    const spalten = bmd.slice(1).map((z) => z.split(";"));
    expect(spalten.map((s) => s[4])).toEqual(Array(3).fill(r.body.belegnummer));
    // steuercode (7) / buchcode (8): Ausgabe 2/1, Einnahme 1/2
    expect(spalten.map((s) => [s[7], s[8], s[11]])).toEqual([
      ["2", "1", "Lebensmittel"],
      ["2", "1", "Getränke"],
      ["1", "2", "Pfand retour"],
    ]);
  });

  it("NTCS-Export für die ganze Firma oder eine einzelne Kostenstelle", async () => {
    await erfasser.post("/api/buchungen").send(buchungEingabe(basis.ksA, basis.kontoId));
    const admin = await alsAgent("admin");
    await admin.post("/api/buchungen").send(buchungEingabe(basis.ksB, basis.kontoId));
    const finanzen = await alsAgent("finanzen");

    const firma = await binaerLatin1(finanzen, "/api/export/bmd?firma=1&jahr=2026&monat=5");
    expect(firma).toHaveLength(3);

    const einzeln = await finanzen.get(`/api/export/bmd?firma=1&kostenstelle=${basis.ksB}&jahr=2026&monat=5`);
    expect(einzeln.status).toBe(200);
    expect(einzeln.headers["content-disposition"]).toContain("bmd_ka_oehtb_dienstleistungen_gmbh_ks2000_2026_05.csv");
    expect(einzeln.text.trim().split("\r\n")).toHaveLength(2);
    expect(einzeln.text).toContain(";2000;"); // kost = Kostenstelle 2000

    // Kostenstelle einer anderen Firma bzw. ungültig -> 400
    await prisma.kostenstelle.update({ where: { id: basis.ksB }, data: { firmaId: 2 } });
    expect((await finanzen.get(`/api/export/bmd?firma=1&kostenstelle=${basis.ksB}&jahr=2026&monat=5`)).status).toBe(400);
    expect((await finanzen.get(`/api/export/csv?firma=1&kostenstelle=abc&jahr=2026&monat=5`)).status).toBe(400);
  });
});
