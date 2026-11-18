import { describe, it, expect } from "vitest";
import { betragCent, positionsSumme, restzeileAnpassen, LEER, type Position } from "./splitbuchung.js";

const zeile = (betrag: string, mehr: Partial<Position> = {}): Position => ({
  ...LEER,
  kontoId: 1,
  steuersatz: 20,
  text: "x",
  betrag,
  ...mehr,
});

describe("betragCent", () => {
  it("nimmt nur positive, eindeutige Beträge an", () => {
    expect(betragCent("12,50")).toBe(1250);
    expect(betragCent("12.50")).toBe(1250);
    expect(betragCent("0")).toBeNull();
    expect(betragCent("-5")).toBeNull();
    expect(betragCent("12abc")).toBeNull();
    expect(betragCent("")).toBeNull();
  });
});

describe("positionsSumme", () => {
  it("zieht Zeilen des anderen Typs ab (Hofer: 10 + 20 − 5 = 25)", () => {
    const pos = [zeile("10,00"), zeile("20,00"), zeile("5,00", { typ: "eingang" })];
    expect(positionsSumme(pos, "ausgang")).toBe(2500);
  });
});

describe("restzeileAnpassen", () => {
  it("schlägt bei offenem Rest eine Zeile mit dem Restbetrag vor", () => {
    const r = restzeileAnpassen([zeile("10,00")], 2500, "ausgang");
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ auto: true, betrag: "15,00", typ: "ausgang", kontoId: 0 });
  });

  it("schlägt bei zu viel aufgeteiltem Betrag eine Zeile des anderen Typs vor", () => {
    const r = restzeileAnpassen([zeile("30,00")], 2500, "ausgang");
    expect(r[1]).toMatchObject({ auto: true, betrag: "5,00", typ: "eingang" });
  });

  it("passt eine unberührte Vorschlagszeile an und entfernt sie bei Rest 0", () => {
    const mitVorschlag = restzeileAnpassen([zeile("10,00")], 2500, "ausgang");
    const angepasst = restzeileAnpassen([zeile("12,00"), mitVorschlag[1]], 2500, "ausgang");
    expect(angepasst[1]).toMatchObject({ auto: true, betrag: "13,00" });
    const weg = restzeileAnpassen([zeile("25,00"), mitVorschlag[1]], 2500, "ausgang");
    expect(weg).toHaveLength(1);
  });

  it("schlägt nichts vor, solange eine Zeile unvollständig ist oder der Gesamtbetrag fehlt", () => {
    const halb = [zeile("10,00", { kontoId: 0 })];
    expect(restzeileAnpassen(halb, 2500, "ausgang")).toBe(halb);
    const ok = [zeile("10,00")];
    expect(restzeileAnpassen(ok, null, "ausgang")).toBe(ok);
  });

  it("lässt alles unverändert, wenn die Zeilen den Gesamtbetrag ergeben", () => {
    const pos = [zeile("10,00"), zeile("15,00")];
    expect(restzeileAnpassen(pos, 2500, "ausgang")).toBe(pos);
  });
});
