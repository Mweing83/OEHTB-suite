import { describe, it, expect } from "vitest";
import { extrahiereJsonArray, mitWiederholung } from "./typen";
import { erzeugeProvider } from "./factory";

describe("extrahiereJsonArray", () => {
  it("zieht ein Array aus Text mit Zaeunen", () => {
    const text = 'Hier das Ergebnis:\n```json\n[{"titel":"A"}]\n```\nFertig.';
    expect(extrahiereJsonArray<{ titel: string }>(text)).toEqual([{ titel: "A" }]);
  });

  it("wirft bei fehlendem Array", () => {
    expect(() => extrahiereJsonArray("kein json")).toThrow();
  });

  it("bevorzugt den letzten Zaun (Prosa mit eckigen Klammern davor/danach)", () => {
    const text =
      "Zwischenstand [siehe oben]:\n```json\n[{\"titel\":\"Echt\"}]\n```\nHinweis: [Ende].";
    expect(extrahiereJsonArray<{ titel: string }>(text)).toEqual([{ titel: "Echt" }]);
  });

  it("repariert haengende Kommas", () => {
    const text = '[{"titel":"A",},]';
    expect(extrahiereJsonArray<{ titel: string }>(text)).toEqual([{ titel: "A" }]);
  });

  it("wirft deutschen Fehler bei unescapten Anfuehrungszeichen", () => {
    const text = '[{"titel":"Call "Inklusion" 2026"}]';
    expect(() => extrahiereJsonArray(text)).toThrow(/kein gueltiges JSON-Array/);
  });
});

describe("mitWiederholung", () => {
  it("wiederholt genau einmal und liefert das zweite Ergebnis", async () => {
    let versuche = 0;
    const ergebnis = await mitWiederholung(async () => {
      versuche++;
      if (versuche === 1) throw new Error("erster Versuch scheitert");
      return "ok";
    });
    expect(ergebnis).toBe("ok");
    expect(versuche).toBe(2);
  });

  it("wirft nach dem zweiten Fehlschlag", async () => {
    let versuche = 0;
    await expect(
      mitWiederholung(async () => {
        versuche++;
        throw new Error("dauerhaft kaputt");
      })
    ).rejects.toThrow("dauerhaft kaputt");
    expect(versuche).toBe(2);
  });
});

describe("erzeugeProvider", () => {
  it("faellt ohne API-Key auf dummy zurueck", () => {
    expect(erzeugeProvider({ provider: "anthropic" }).name).toBe("dummy");
    expect(erzeugeProvider({ provider: "openai" }).name).toBe("dummy");
  });

  it("liefert die konfigurierten Provider mit Key", () => {
    expect(erzeugeProvider({ provider: "anthropic", apiKey: "x" }).name).toBe("anthropic");
    expect(erzeugeProvider({ provider: "openai", apiKey: "x" }).name).toBe("openai");
    expect(erzeugeProvider({ provider: "dummy" }).name).toBe("dummy");
  });
});
