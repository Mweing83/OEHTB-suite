import { describe, it, expect } from "vitest";
import { csvFeld } from "./csv.js";

describe("csvFeld (Formel-Neutralisierung)", () => {
  it("entschärft Formel-Auslöser und quotet sie", () => {
    expect(csvFeld("=10*10")).toBe(`"'=10*10"`);
    expect(csvFeld("+1+1")).toBe(`"'+1+1"`);
    expect(csvFeld("-1-1")).toBe(`"'-1-1"`);
    expect(csvFeld("@SUM(1;1)")).toBe(`"'@SUM(1;1)"`);
    expect(csvFeld("\t=1+1")).toBe(`"'=1+1"`);
    expect(csvFeld("\r=1+1")).toBe(`"'=1+1"`);
    expect(csvFeld('=HYPERLINK("http://x";"y")')).toBe(`"'=HYPERLINK(""http://x"";""y"")"`);
  });

  it("lässt Beträge und normale Texte unverändert", () => {
    expect(csvFeld("-10,00")).toBe("-10,00");
    expect(csvFeld("1,67")).toBe("1,67");
    expect(csvFeld(-5)).toBe("-5");
    expect(csvFeld("Kaffee & Milch")).toBe("Kaffee & Milch");
    expect(csvFeld("a;b")).toBe(`"a;b"`);
    expect(csvFeld("Zeile1\nZeile2")).toBe("Zeile1 Zeile2");
  });
});
