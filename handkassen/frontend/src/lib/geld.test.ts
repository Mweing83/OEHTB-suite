import { describe, it, expect } from "vitest";
import { formatProzent } from "./geld.js";

describe("formatProzent", () => {
  it("zeigt ganze Saetze ohne Nachkommastelle", () => {
    expect(formatProzent(20)).toBe("20");
    expect(formatProzent(13)).toBe("13");
    expect(formatProzent(10)).toBe("10");
    expect(formatProzent(0)).toBe("0");
  });

  it("zeigt gebrochene Saetze mit einer Nachkommastelle und de-AT-Komma", () => {
    expect(formatProzent(4.9)).toBe("4,9");
  });
});
