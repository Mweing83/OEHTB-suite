import { describe, it, expect } from "vitest";
import {
  betragCent,
  fehlendeFelder,
  gesamtUndRest,
  positionsSumme,
  restzeileAnpassen,
  tagAusEingabe,
  LEER,
  type FormularStand,
  type Position,
} from "./splitbuchung.js";

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

describe("gesamtUndRest", () => {
  it("ohne Split: Gesamtbetrag = Betrag der Zeile, kein Rest", () => {
    expect(gesamtUndRest(false, "", [zeile("12,50")], "ausgang")).toEqual({ gesamtCent: 1250, restCent: 0 });
    expect(gesamtUndRest(false, "", [zeile("")], "ausgang")).toEqual({ gesamtCent: null, restCent: 0 });
  });

  it("mit Split: Rest gegen den Gesamtbetrag laut Beleg, Einnahme-Zeilen zählen minus", () => {
    const pos = [zeile("10,00"), zeile("20,00"), zeile("5,00", { typ: "eingang" })];
    expect(gesamtUndRest(true, "25,00", pos, "ausgang")).toEqual({ gesamtCent: 2500, restCent: 0 });
    expect(gesamtUndRest(true, "30,00", pos, "ausgang").restCent).toBe(500);
    expect(gesamtUndRest(true, "20,00", pos, "ausgang").restCent).toBe(-500);
    expect(gesamtUndRest(true, "", pos, "ausgang")).toEqual({ gesamtCent: null, restCent: 0 });
  });
});

describe("tagAusEingabe", () => {
  it("nimmt nur Tage an, die es im Monat gibt", () => {
    expect(tagAusEingabe("5", 30)).toBe(5);
    expect(tagAusEingabe(" 30 ", 30)).toBe(30);
    expect(tagAusEingabe("31", 30)).toBeNull();
    expect(tagAusEingabe("0", 31)).toBeNull();
    expect(tagAusEingabe("", 31)).toBeNull();
    expect(tagAusEingabe("1a", 31)).toBeNull();
  });
});

describe("fehlendeFelder (Pflichtfeld-Prüfung des Buchungsformulars)", () => {
  const stand = (mehr: Partial<FormularStand> = {}): FormularStand => ({
    tag: "5",
    tageImMonat: 30,
    typ: "ausgang",
    split: false,
    gesamt: "",
    positionen: [zeile("12,50")],
    beschreibung: "Testbuchung",
    ...mehr,
  });

  it("vollständige einfache Buchung: nichts offen", () => {
    expect(fehlendeFelder(stand())).toEqual([]);
  });

  it("nennt die offenen Angaben in Formular-Reihenfolge", () => {
    expect(fehlendeFelder(stand({ tag: "", positionen: [{ ...LEER }], beschreibung: " " }))).toEqual([
      "Tag",
      "Konto",
      "Betrag",
      "Steuersatz",
      "Beschreibung",
    ]);
  });

  it("meldet einen Tag außerhalb des Monats mit dem erlaubten Bereich", () => {
    expect(fehlendeFelder(stand({ tag: "31" }))).toEqual(["Tag (1–30)"]);
  });

  it("Splitbuchung: Beschreibung je Zeile statt für die Buchung", () => {
    const pos = [zeile("10,00"), zeile("15,00", { text: "" })];
    expect(fehlendeFelder(stand({ split: true, gesamt: "25,00", positionen: pos, beschreibung: "" }))).toEqual([
      "Position 2: Beschreibung",
    ]);
  });

  it("Splitbuchung: fehlender Gesamtbetrag und offener bzw. überzogener Rest", () => {
    const pos = [zeile("10,00"), zeile("15,00")];
    expect(fehlendeFelder(stand({ split: true, gesamt: "", positionen: pos }))).toEqual(["Gesamtbetrag"]);
    const offen = fehlendeFelder(stand({ split: true, gesamt: "30,00", positionen: pos }));
    expect(offen).toHaveLength(1);
    expect(offen[0]).toMatch(/^noch .*5,00.* aufzuteilen$/);
    const zuViel = fehlendeFelder(stand({ split: true, gesamt: "20,00", positionen: pos }));
    expect(zuViel).toHaveLength(1);
    expect(zuViel[0]).toMatch(/5,00.* zu viel aufgeteilt$/);
  });
});
