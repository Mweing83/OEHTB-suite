import { describe, it, expect } from "vitest";
import {
  buchungValidieren,
  saldoWirkung,
  belegnummerFormat,
  type BuchungEingabe,
} from "./buchungslogik.js";

function basis(overrides: Partial<BuchungEingabe> = {}): BuchungEingabe {
  return {
    betragCent: 1000,
    belegdatum: "2026-05-01",
    typ: "ausgang",
    kostenstelleId: 1,
    positionen: [{ betragCent: 1000, steuersatz: 20, kontoId: 1 }],
    ...overrides,
  };
}

describe("buchungValidieren", () => {
  it("akzeptiert eine einfache gültige Buchung", () => {
    expect(buchungValidieren(basis()).ok).toBe(true);
  });

  it("akzeptiert eine korrekte Split-Buchung", () => {
    const b = basis({
      betragCent: 1381, // 7,65 (10%) + 6,16 (20%)
      positionen: [
        { betragCent: 765, steuersatz: 10, kontoId: 1 },
        { betragCent: 616, steuersatz: 20, kontoId: 2 },
      ],
    });
    expect(buchungValidieren(b).ok).toBe(true);
  });

  it("lehnt ab, wenn die Positionssumme nicht passt", () => {
    const b = basis({
      betragCent: 1000,
      positionen: [{ betragCent: 999, steuersatz: 20, kontoId: 1 }],
    });
    const r = buchungValidieren(b);
    expect(r.ok).toBe(false);
    expect(r.fehler.join(" ")).toContain("entspricht nicht");
  });

  it("lehnt unerlaubte Steuersätze ab", () => {
    const b = basis({ positionen: [{ betragCent: 1000, steuersatz: 13, kontoId: 1 }] });
    expect(buchungValidieren(b).ok).toBe(false);
  });

  it("akzeptiert einen per Parameter erlaubten Sondersatz (z. B. 13 %)", () => {
    const b = basis({ positionen: [{ betragCent: 1000, steuersatz: 13, kontoId: 1 }] });
    expect(buchungValidieren(b, [0, 10, 13, 20]).ok).toBe(true);
  });

  it("lehnt einen Satz ab, der nicht mehr in der erlaubten Liste ist", () => {
    const b = basis({ positionen: [{ betragCent: 1000, steuersatz: 20, kontoId: 1 }] });
    expect(buchungValidieren(b, [0, 10]).ok).toBe(false);
  });

  it("lehnt nicht-positive Beträge ab", () => {
    expect(buchungValidieren(basis({ betragCent: 0 })).ok).toBe(false);
  });

  it("verlangt mindestens eine Position", () => {
    expect(buchungValidieren(basis({ positionen: [] })).ok).toBe(false);
  });

  it("erlaubt einen dezimalen Steuersatz (4,9 %), wenn er freigegeben ist", () => {
    const eingabe = {
      betragCent: 1000,
      belegdatum: "2026-05-15",
      typ: "ausgang" as const,
      kostenstelleId: 1,
      positionen: [{ betragCent: 1000, steuersatz: 4.9, kontoId: 1 }],
    };
    expect(buchungValidieren(eingabe, [0, 4.9, 20]).ok).toBe(true);
  });
});

describe("saldoWirkung", () => {
  it("Eingang erhöht den Saldo", () => {
    expect(saldoWirkung("eingang", 500)).toBe(500);
  });
  it("Ausgang verringert den Saldo", () => {
    expect(saldoWirkung("ausgang", 500)).toBe(-500);
  });
});

describe("belegnummerFormat", () => {
  it("setzt Jahr-Kostenstelle-laufende Nummer zusammen", () => {
    expect(belegnummerFormat(2026, "1260", 1)).toBe("2026-1260-01");
    expect(belegnummerFormat(2026, "1260", 9)).toBe("2026-1260-09");
  });
  it("füllt die laufende Nummer zweistellig auf, dreistellig bleibt", () => {
    expect(belegnummerFormat(2026, "1260", 12)).toBe("2026-1260-12");
    expect(belegnummerFormat(2026, "1260", 100)).toBe("2026-1260-100");
  });
  it("verwendet das übergebene Jahr und die Kostenstellen-Nummer", () => {
    expect(belegnummerFormat(2027, "1370", 1)).toBe("2027-1370-01");
  });
});
