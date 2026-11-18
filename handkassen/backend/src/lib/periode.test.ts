import { describe, it, expect } from "vitest";
import { idAusQuery, istId, istJahr, istMonat, jahrMonatAusQuery } from "./periode.js";

describe("Prüfung von ID, Jahr und Monat", () => {
  it("akzeptiert nur positive Ganzzahlen als ID", () => {
    expect(istId(1)).toBe(true);
    for (const w of [0, -1, 1.5, "1", null, undefined, NaN]) expect(istId(w)).toBe(false);
    expect(idAusQuery("12")).toBe(12);
    for (const w of ["", "abc", "0", "-3", "1.5", undefined, 12, ["1"]]) expect(idAusQuery(w)).toBeNull();
  });

  it("begrenzt Jahr auf 2000–2100 und Monat auf 1–12", () => {
    expect(istJahr(2026)).toBe(true);
    expect(istJahr(1999)).toBe(false);
    expect(istJahr(2101)).toBe(false);
    expect(istMonat(1)).toBe(true);
    expect(istMonat(12)).toBe(true);
    expect(istMonat(0)).toBe(false);
    expect(istMonat(13)).toBe(false);
  });

  it("liest jahr/monat aus der Query oder liefert null", () => {
    expect(jahrMonatAusQuery({ jahr: "2026", monat: "5" })).toEqual({ jahr: 2026, monat: 5 });
    expect(jahrMonatAusQuery({ jahr: "2026", monat: "13" })).toBeNull();
    expect(jahrMonatAusQuery({ jahr: "2026" })).toBeNull();
    expect(jahrMonatAusQuery({ jahr: "abc", monat: "5" })).toBeNull();
    expect(jahrMonatAusQuery({})).toBeNull();
  });
});
