import { describe, it, expect } from "vitest";
import { bmdZeile, bmdCsv, BMD_SPALTEN, type BmdPosition } from "./bmd-export.js";

function pos(overrides: Partial<BmdPosition> = {}): BmdPosition {
  return {
    betragCent: 8388, // 69,90 netto + 13,98 Steuer
    steuersatz: 20,
    kontoNummer: "73800",
    typ: "ausgang",
    belegdatum: new Date(2026, 6, 28),
    belegnummer: "2026-5000-01",
    kostenstelleNummer: "5000",
    gegenkonto: "99950",
    beschreibung: "A1 Internet",
    dokument: "2026-5000-01.png",
    ...overrides,
  };
}

describe("BMD-CSV", () => {
  it("hat die vorgegebene Kopfzeile inkl. dokument", () => {
    const zeilen = bmdCsv([]).toString("latin1").split("\r\n");
    expect(zeilen[0]).toBe(
      "satzart;konto;gkonto;belegdatum;belegnr;kost;prozent;steuercode;buchcode;betrag;steuer;text;buchsymbol;dokument"
    );
    expect(BMD_SPALTEN).toHaveLength(14);
  });

  it("Ausgabe: netto + Steuer, steuercode 2 (Vorsteuer), buchcode 1 (Soll), Belegdatei", () => {
    expect(bmdZeile(pos())).toBe(
      "0;73800;99950;20260728;2026-5000-01;5000;20;2;1;69,90;13,98;A1 Internet;KA;2026-5000-01.png"
    );
  });

  it("Steuersatz mit Nachkommastelle und 0 % (Komma als Dezimaltrenner)", () => {
    expect(bmdZeile(pos({ steuersatz: 4.9, betragCent: 1313 })).split(";").slice(6, 11)).toEqual([
      "4,9", "2", "1", "12,52", "0,61",
    ]);
    expect(bmdZeile(pos({ steuersatz: 0, betragCent: 900 })).split(";").slice(6, 11)).toEqual([
      "0", "2", "1", "9,00", "0,00",
    ]);
  });

  it("Einnahme (auch Dotierung): buchcode 2 (Haben), steuercode 1 (USt), positiv", () => {
    expect(
      bmdZeile(pos({ typ: "eingang", kontoNummer: "28940", betragCent: 25000, steuersatz: 0, beschreibung: "Dot.", dokument: "" }))
    ).toBe("0;28940;99950;20260728;2026-5000-01;5000;0;1;2;250,00;0,00;Dot.;KA;");
    expect(bmdZeile(pos({ typ: "eingang", betragCent: 1200 })).split(";").slice(6, 11)).toEqual([
      "20", "1", "2", "10,00", "2,00",
    ]);
  });

  it("Text mit Semikolon wird gequotet, Formeln entschärft", () => {
    expect(bmdZeile(pos({ beschreibung: "Kaffee; Milch" }))).toContain(';"Kaffee; Milch";');
    expect(bmdZeile(pos({ beschreibung: "=HYPERLINK(1)" }))).toContain(";\"'=HYPERLINK(1)\";");
  });

  it("kodiert Latin-1 und ersetzt Zeichen außerhalb davon", () => {
    const buf = bmdCsv([pos({ beschreibung: "Büro 5€ – Bon" })]);
    expect(buf.toString("latin1")).toContain(";Büro 5EUR ? Bon;");
  });
});
