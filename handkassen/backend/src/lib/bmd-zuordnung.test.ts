import { describe, it, expect } from "vitest";
import { BMD_CODES, BMD_FIX } from "./bmd-zuordnung.js";

// Diese Tests sichern die mit der Buchhaltung abgestimmten BMD-Zuordnungen ab:
// Eine versehentliche Änderung würde fehlerhafte Exporte erzeugen und fällt hier
// sofort auf. Bei einer BEWUSSTEN Änderung sind die Erwartungen mit anzupassen.

describe("BMD_CODES", () => {
  it("Ausgabe: Soll (1) mit Vorsteuer (2); Einnahme: Haben (2) mit Umsatzsteuer (1)", () => {
    expect(BMD_CODES.ausgang).toEqual({ buchcode: "1", steuercode: "2" });
    expect(BMD_CODES.eingang).toEqual({ buchcode: "2", steuercode: "1" });
  });
});

describe("BMD_FIX", () => {
  it("hält die festen Exportwerte (Satzart, Buchsymbol Kassa)", () => {
    expect(BMD_FIX.satzart).toBe("0");
    expect(BMD_FIX.buchsymbol).toBe("KA");
  });
});
