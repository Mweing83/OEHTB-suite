import { describe, it, expect } from "vitest";
import { csvFeld } from "./mitarbeiter";

describe("Stunden csvFeld (Formel-Neutralisierung)", () => {
  it("entschärft Formel-Auslöser und lässt Zahlen numerisch", () => {
    expect(csvFeld("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvFeld("@Bereich")).toBe(`"'@Bereich"`);
    expect(csvFeld("+43")).toBe(`"'+43"`);
    expect(csvFeld("38,5")).toBe("38,5");
    expect(csvFeld("-1,5")).toBe("-1,5");
    expect(csvFeld("Müller")).toBe("Müller");
  });
});
