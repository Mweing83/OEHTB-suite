import { LLMProvider, ParseErgebnis } from "./typen";

// ---------------------------------------------------------------------------
// Dummy-Provider (Attrappe).
// Nutzt einfache regulaere Ausdruecke, um typische Formulierungen ohne echte
// KI auszulesen. Dient zum Testen ohne API-Key. Liefert bewusst eine
// niedrigere Konfidenz, damit klar ist, dass kein echtes Modell geantwortet hat.
// ---------------------------------------------------------------------------

export class DummyProvider implements LLMProvider {
  name = "dummy";

  async parseAenderung(text: string): Promise<ParseErgebnis> {
    const ergebnis: ParseErgebnis = {
      personPlatzhalter: null,
      neuStunden: null,
      altStunden: null,
      ausmassProzent: null,
      gueltigAb: null,
      konfidenz: 0.4,
      hinweis: "Attrappe (kein echtes KI-Modell) – bitte sorgfaeltig pruefen.",
    };

    // Platzhalter PERSON_n
    const person = text.match(/PERSON_\d+/);
    if (person) ergebnis.personPlatzhalter = person[0];

    // "von 35 auf 30" -> alt 35, neu 30
    const vonAuf = text.match(/von\s+(\d+(?:[.,]\d+)?)\s+auf\s+(\d+(?:[.,]\d+)?)/i);
    if (vonAuf) {
      ergebnis.altStunden = Number(vonAuf[1].replace(",", "."));
      ergebnis.neuStunden = Number(vonAuf[2].replace(",", "."));
    } else {
      // sonst: erste Zahl mit "Stunden"
      const std = text.match(/(\d+(?:[.,]\d+)?)\s*(?:wochen)?stunden/i);
      if (std) ergebnis.neuStunden = Number(std[1].replace(",", "."));
    }

    // Ausmass in Prozent
    const proz = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (proz) ergebnis.ausmassProzent = Number(proz[1].replace(",", "."));

    // Datum DD.MM.YYYY -> YYYY-MM-DD
    const datum = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (datum) {
      const [, t, m, j] = datum;
      ergebnis.gueltigAb = `${j}-${m.padStart(2, "0")}-${t.padStart(2, "0")}`;
    }

    return ergebnis;
  }
}
