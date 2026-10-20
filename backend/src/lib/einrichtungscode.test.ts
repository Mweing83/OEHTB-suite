import { describe, it, expect } from "vitest";
import { einrichtungsCodeErzeugen, einrichtungsCodePruefen } from "./einrichtungscode";

describe("Einrichtungscode", () => {
  it("erzeugt das Format XXXX-XXXX-XXXX ohne verwechselbare Zeichen", () => {
    const c = einrichtungsCodeErzeugen();
    expect(c.klartext).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("akzeptiert den richtigen Code, auch klein geschrieben und ohne Bindestriche", () => {
    const c = einrichtungsCodeErzeugen();
    expect(einrichtungsCodePruefen(c.klartext, c.hash, c.bis)).toBe(true);
    expect(
      einrichtungsCodePruefen(c.klartext.replace(/-/g, "").toLowerCase(), c.hash, c.bis)
    ).toBe(true);
  });

  it("lehnt falschen, leeren, fehlenden und abgelaufenen Code ab", () => {
    const c = einrichtungsCodeErzeugen();
    const anderer = einrichtungsCodeErzeugen();
    expect(einrichtungsCodePruefen(anderer.klartext, c.hash, c.bis)).toBe(false);
    expect(einrichtungsCodePruefen("", c.hash, c.bis)).toBe(false);
    expect(einrichtungsCodePruefen(c.klartext, null, c.bis)).toBe(false);
    expect(einrichtungsCodePruefen(c.klartext, c.hash, null)).toBe(false);
    expect(einrichtungsCodePruefen(c.klartext, c.hash, new Date(Date.now() - 1000))).toBe(false);
  });
});
