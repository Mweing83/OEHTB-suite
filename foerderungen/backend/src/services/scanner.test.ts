import { describe, it, expect } from "vitest";
import { normalisiereLink, namenAehnlich } from "./scanner";

describe("normalisiereLink", () => {
  it("entfernt Protokoll, www, Tracking und Slash am Ende", () => {
    expect(normalisiereLink("https://www.FSW.at/Calls/2026/?utm_source=x")).toBe(
      "fsw.at/calls/2026"
    );
    expect(normalisiereLink("http://fsw.at/calls/2026")).toBe("fsw.at/calls/2026");
  });

  it("behaelt inhaltliche Query-Parameter", () => {
    expect(normalisiereLink("https://beispiel.at/call?id=7&utm_medium=m")).toBe(
      "beispiel.at/call?id=7"
    );
  });

  it("faellt bei ungueltiger URL auf Trim+Kleinschreibung zurueck", () => {
    expect(normalisiereLink("  Kein-Link  ")).toBe("kein-link");
  });
});

describe("namenAehnlich", () => {
  it("erkennt gleiche Namen trotz Gross/Klein, Umlauten und Zusaetzen", () => {
    expect(namenAehnlich("FSW – Tagesstruktur", "fsw tagesstruktur")).toBe(true);
    expect(namenAehnlich("Licht ins Dunkel", "LICHT INS DUNKEL (ORF)")).toBe(true);
    expect(namenAehnlich("Fonds Soziales Wien", "Fonds Gesundes Oesterreich")).toBe(false);
  });
});
