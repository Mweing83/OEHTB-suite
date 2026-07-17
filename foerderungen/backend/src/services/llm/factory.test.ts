import { describe, it, expect } from "vitest";
import { extrahiereJsonArray } from "./typen";
import { erzeugeProvider } from "./factory";

describe("extrahiereJsonArray", () => {
  it("zieht ein Array aus Text mit Zaeunen", () => {
    const text = 'Hier das Ergebnis:\n```json\n[{"titel":"A"}]\n```\nFertig.';
    expect(extrahiereJsonArray<{ titel: string }>(text)).toEqual([{ titel: "A" }]);
  });

  it("wirft bei fehlendem Array", () => {
    expect(() => extrahiereJsonArray("kein json")).toThrow();
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
