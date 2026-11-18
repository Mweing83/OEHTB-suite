import { describe, it, expect } from "vitest";
import { nettoUndSteuer } from "./buchungslogik.js";

describe("nettoUndSteuer", () => {
  it("rechnet 4,9 % korrekt auf den Cent", () => {
    // 1049 Cent brutto bei 4,9 %: netto 1049/1.049 = 1000 -> Steueranteil 49 Cent.
    expect(nettoUndSteuer(1049, 4.9)).toEqual({ nettoCent: 1000, steuerCent: 49 });
  });

  it("liefert bei 0 % keinen Steueranteil", () => {
    expect(nettoUndSteuer(1000, 0)).toEqual({ nettoCent: 1000, steuerCent: 0 });
  });

  it("rundet die Steuer, das Netto ist der Rest (netto + steuer = brutto)", () => {
    // 11,85 € bei 20 %: Steuer 1,975 -> 1,98; netto 9,87.
    expect(nettoUndSteuer(1185, 20)).toEqual({ nettoCent: 987, steuerCent: 198 });
    for (const [brutto, satz] of [[315, 4.9], [1000, 10], [999, 20], [1, 20], [123457, 13]]) {
      const { nettoCent, steuerCent } = nettoUndSteuer(brutto, satz);
      expect(nettoCent + steuerCent).toBe(brutto);
    }
  });
});
