import { describe, it, expect } from "vitest";
import { euroZuCent, centZuEuro, formatCent } from "./geld.js";

describe("euroZuCent", () => {
  it("rechnet Euro in ganze Cent um", () => {
    expect(euroZuCent(12.5)).toBe(1250);
    expect(euroZuCent(19.99)).toBe(1999);
    expect(euroZuCent(0)).toBe(0);
  });

  it("rundet kaufmännisch auf ganze Cent", () => {
    // 0.1 * 100 ergibt in Gleitkomma 10.000…2 -> muss 10 bleiben
    expect(euroZuCent(0.1)).toBe(10);
    expect(euroZuCent(12.34)).toBe(1234);
    expect(euroZuCent(0.014)).toBe(1);
    expect(euroZuCent(0.016)).toBe(2);
  });

  it("verarbeitet negative Beträge", () => {
    expect(euroZuCent(-5.5)).toBe(-550);
  });
});

describe("centZuEuro", () => {
  it("rechnet Cent in Euro um", () => {
    expect(centZuEuro(1250)).toBe(12.5);
    expect(centZuEuro(0)).toBe(0);
    expect(centZuEuro(-550)).toBe(-5.5);
  });

  it("ist die Umkehrung von euroZuCent für saubere Beträge", () => {
    for (const euro of [0, 1, 12.5, 19.99, 100.01]) {
      expect(centZuEuro(euroZuCent(euro))).toBeCloseTo(euro, 2);
    }
  });
});

describe("formatCent", () => {
  it("formatiert mit Euro-Zeichen und Dezimal-Komma", () => {
    const s = formatCent(1250);
    expect(s).toContain("12,50");
    expect(s).toContain("€");
  });

  it("zeigt immer zwei Nachkommastellen", () => {
    expect(formatCent(1000)).toContain("10,00");
    expect(formatCent(5)).toContain("0,05");
  });

  it("formatiert negative Beträge", () => {
    const s = formatCent(-1250);
    expect(s).toContain("12,50");
    expect(s).toMatch(/-/);
  });
});
