import { describe, it, expect } from "vitest";
import { formatProzent, euroStringZuCent } from "./geld.js";

describe("euroStringZuCent", () => {
  it("liest deutsche Schreibweise mit Komma und Tausenderpunkt", () => {
    expect(euroStringZuCent("12,50")).toBe(1250);
    expect(euroStringZuCent("12,5")).toBe(1250);
    expect(euroStringZuCent("12")).toBe(1200);
    expect(euroStringZuCent("1.250,00")).toBe(125000);
    expect(euroStringZuCent("1.250")).toBe(125000);
    expect(euroStringZuCent(" 0,05 € ")).toBe(5);
    expect(euroStringZuCent("-10,00")).toBe(-1000);
  });

  it("liest den Punkt als Dezimaltrenner (Ziffernblock): 12.50 sind 12,50 und nicht 1.250,00", () => {
    expect(euroStringZuCent("12.50")).toBe(1250);
    expect(euroStringZuCent("3.5")).toBe(350);
    expect(euroStringZuCent("0.99")).toBe(99);
  });

  it("rechnet ohne Float-Rundungsfehler", () => {
    expect(euroStringZuCent("1,15")).toBe(115);
    expect(euroStringZuCent("8,95")).toBe(895);
    expect(euroStringZuCent("19,99")).toBe(1999);
  });

  it("lehnt alles Uneindeutige ab", () => {
    for (const t of ["", "abc", "12abc", "1,2,3", "12,345", "1.2.3", "12.", ",50", "1.25.00", "1 250,00 EUR"]) {
      expect(euroStringZuCent(t), t).toBeNaN();
    }
  });
});

describe("formatProzent", () => {
  it("zeigt ganze Saetze ohne Nachkommastelle", () => {
    expect(formatProzent(20)).toBe("20");
    expect(formatProzent(13)).toBe("13");
    expect(formatProzent(10)).toBe("10");
    expect(formatProzent(0)).toBe("0");
  });

  it("zeigt gebrochene Saetze mit einer Nachkommastelle und de-AT-Komma", () => {
    expect(formatProzent(4.9)).toBe("4,9");
  });
});
