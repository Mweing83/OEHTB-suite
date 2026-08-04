import { describe, it, expect } from "vitest";
import { enthalteneSteuerCent } from "./pdf.js";

describe("enthalteneSteuerCent mit dezimalem Satz", () => {
  it("rechnet 4,9 % korrekt auf den Cent", () => {
    // 1049 Cent brutto bei 4,9 %: netto 1049/1.049 = 1000 -> Steueranteil 49 Cent.
    expect(enthalteneSteuerCent(1049, 4.9)).toBe(49);
  });

  it("liefert bei 0 % keinen Steueranteil", () => {
    expect(enthalteneSteuerCent(1000, 0)).toBe(0);
  });
});
