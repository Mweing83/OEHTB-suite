import { describe, it, expect } from "vitest";
import { KONTEN_MIT_STEUERCODE_00, BMD_FIX } from "./bmd-zuordnung.js";

// Diese Tests sichern die mit der Buchhaltung abgestimmten BMD-Zuordnungen ab:
// Eine versehentliche Änderung würde fehlerhafte Exporte erzeugen und fällt hier
// sofort auf. Bei einer BEWUSSTEN Änderung sind die Erwartungen mit anzupassen.

describe("KONTEN_MIT_STEUERCODE_00", () => {
  it("enthält genau die abgestimmten Konten (Steuercode 00)", () => {
    expect([...KONTEN_MIT_STEUERCODE_00].sort()).toEqual(
      ["22991", "268016", "28970", "97000", "99900"].sort()
    );
  });

  it("vergleicht Kontonummern als Strings (kein Zahlen-Casting)", () => {
    expect(KONTEN_MIT_STEUERCODE_00.has("99900")).toBe(true);
    expect(KONTEN_MIT_STEUERCODE_00.has("76900")).toBe(false);
  });
});

describe("BMD_FIX", () => {
  it("hält die festen Exportwerte (Satzart, Buchsymbol Kassa)", () => {
    expect(BMD_FIX.satzart).toBe("0");
    expect(BMD_FIX.buchsymbol).toBe("KA");
  });
});
