import { describe, it, expect } from "vitest";
import { autoGesperrt } from "./sperre.js";

// Hinweis: In autoGesperrt ist "monat" 1-basiert (1 = Jänner). Intern bildet
// new Date(jahr, monat, 1) bewusst den ersten Tag des FOLGEmonats. Die hier
// per new Date(jahr, monatIndex, tag) erzeugten Vergleichszeitpunkte nutzen den
// 0-basierten Monatsindex von JavaScript (4 = Mai, 5 = Juni …).

describe("autoGesperrt", () => {
  // Mai 2026, Frist 5 Tage -> gesperrt ab 6. Juni 2026.
  it("ist vor Monatsende nicht gesperrt", () => {
    expect(autoGesperrt(2026, 5, 5, new Date(2026, 4, 31))).toBe(false); // 31. Mai
  });

  it("ist innerhalb der Frist (kurz nach Monatsende) noch nicht gesperrt", () => {
    expect(autoGesperrt(2026, 5, 5, new Date(2026, 5, 5))).toBe(false); // 5. Juni
  });

  it("ist am Frist-Stichtag (00:00) gesperrt", () => {
    expect(autoGesperrt(2026, 5, 5, new Date(2026, 5, 6))).toBe(true); // 6. Juni
  });

  it("ist deutlich nach Fristablauf gesperrt", () => {
    expect(autoGesperrt(2026, 5, 5, new Date(2026, 6, 1))).toBe(true); // 1. Juli
  });

  it("sperrt bei Frist 0 ab dem ersten Tag des Folgemonats", () => {
    expect(autoGesperrt(2026, 5, 0, new Date(2026, 4, 31))).toBe(false); // 31. Mai
    expect(autoGesperrt(2026, 5, 0, new Date(2026, 5, 1))).toBe(true); //  1. Juni
  });

  it("rechnet über den Jahreswechsel korrekt (Dezember)", () => {
    // Dezember 2026, Frist 5 -> gesperrt ab 6. Jänner 2027.
    expect(autoGesperrt(2026, 12, 5, new Date(2027, 0, 5))).toBe(false); // 5. Jän
    expect(autoGesperrt(2026, 12, 5, new Date(2027, 0, 6))).toBe(true); //  6. Jän
  });

  it("berücksichtigt die Frist über einen Monatswechsel hinweg", () => {
    // Mai 2026, Frist 40 Tage -> 1. Juni + 40 = 11. Juli 2026.
    expect(autoGesperrt(2026, 5, 40, new Date(2026, 6, 10))).toBe(false); // 10. Juli
    expect(autoGesperrt(2026, 5, 40, new Date(2026, 6, 11))).toBe(true); //  11. Juli
  });
});
