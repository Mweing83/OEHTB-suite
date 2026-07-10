// ---------------------------------------------------------------------------
// Gemeinsames Interface fuer alle LLM-Provider.
//
// Jeder Provider bekommt den PSEUDONYMISIERTEN Text und liefert ein
// strukturiertes Ergebnis. Provider sehen niemals Klarnamen.
// Im Admin-Tab kann zwischen den Providern umgeschaltet werden.
// ---------------------------------------------------------------------------

export interface ParseErgebnis {
  personPlatzhalter: string | null;
  neuStunden: number | null;
  altStunden: number | null;
  ausmassProzent: number | null;
  gueltigAb: string | null;
  konfidenz: number;
  hinweis: string | null;
}

export interface LLMProvider {
  name: string;
  parseAenderung(pseudonymisierterText: string): Promise<ParseErgebnis>;
}

export interface ProviderKonfig {
  provider: "anthropic" | "openai" | "ollama" | "dummy";
  modell?: string;
  apiKey?: string;
  endpoint?: string;
}

// STANDARD-Wert fuer Vollzeit-Wochenstunden (= 100 %, zur Umrechnung
// Stunden <-> Prozent). Bei OEHTB ueblich 38,5. Dient nur noch als Vorgabe/
// Rueckfall – der tatsaechlich verwendete Wert ist im Admin-Tab konfigurierbar
// (Einstellung "vollzeit_konfig", geladen via ladeVollzeitStunden()).
export const VOLLZEIT_STUNDEN = 38.5;

function iso(d: Date): string {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

// ---------------------------------------------------------------------------
// Berechnet konkrete Datumswerte fuer typische relative Angaben.
// Das Modell muss dann NICHT mehr selbst rechnen (was Sprachmodelle schlecht
// koennen), sondern nur noch den passenden vorgerechneten Wert auswaehlen.
// ---------------------------------------------------------------------------
function datumsHilfen(heute: Date): {
  heute: string;
  ersterNaechsterMonat: string;
  mitteNaechsterMonat: string;
  ersterUebernaechsterMonat: string;
  kommenderMontag: string;
  ersterNaechstesJahr: string;
  monatsName: string;
  naechsterMonatsName: string;
} {
  const jahr = heute.getFullYear();
  const monat = heute.getMonth(); // 0-basiert

  const monatsNamen = [
    "Jaenner", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  const ersterNaechsterMonat = new Date(jahr, monat + 1, 1);
  const mitteNaechsterMonat = new Date(jahr, monat + 1, 15);
  const ersterUebernaechsterMonat = new Date(jahr, monat + 2, 1);
  const ersterNaechstesJahr = new Date(jahr + 1, 0, 1);

  // Kommender Montag (wenn heute Montag ist, der naechste).
  const kommenderMontag = new Date(heute);
  const wochentag = heute.getDay(); // 0=So,1=Mo,...
  const tageBisMontag = ((8 - wochentag) % 7) || 7;
  kommenderMontag.setDate(heute.getDate() + tageBisMontag);

  return {
    heute: iso(heute),
    ersterNaechsterMonat: iso(ersterNaechsterMonat),
    mitteNaechsterMonat: iso(mitteNaechsterMonat),
    ersterUebernaechsterMonat: iso(ersterUebernaechsterMonat),
    kommenderMontag: iso(kommenderMontag),
    ersterNaechstesJahr: iso(ersterNaechstesJahr),
    monatsName: monatsNamen[monat],
    naechsterMonatsName: monatsNamen[(monat + 1) % 12],
  };
}

// ---------------------------------------------------------------------------
// System-Prompt. Wird zur Laufzeit mit vorgerechneten Datumswerten erzeugt.
// ---------------------------------------------------------------------------
export function systemAnweisung(
  vollzeitStunden: number = VOLLZEIT_STUNDEN
): string {
  const h = datumsHilfen(new Date());
  const halbzeit = (vollzeitStunden * 0.5).toFixed(1);

  return `Du bist ein sorgfaeltiger Extraktions-Assistent fuer eine oesterreichische
Personalverwaltung. Aus einer kurzen, oft informellen Mitteilung extrahierst du
die AENDERUNG der woechentlichen Arbeitszeit einer Person.

Personen sind anonymisiert als "PERSON_1", "PERSON_2" usw.

== VORGERECHNETE DATUMSWERTE (heute ist ${h.heute}) ==
Du musst KEINE Datumsarithmetik selbst durchfuehren. Verwende direkt diese
fertigen Werte, wenn die Mitteilung eine relative Angabe enthaelt:

- "ab sofort" / "ab jetzt" / "umgehend"          -> ${h.heute}
- "ab naechster Woche"                            -> ${h.kommenderMontag}
- "ab naechstem/kommendem Monat"                  -> ${h.ersterNaechsterMonat}
- "ab Anfang naechsten Monats"                    -> ${h.ersterNaechsterMonat}
- "ab Mitte naechsten Monats"                     -> ${h.mitteNaechsterMonat}
- "ab uebernaechstem Monat"                       -> ${h.ersterUebernaechsterMonat}
- "ab naechstem Jahr" / "ab Jahresbeginn"         -> ${h.ersterNaechstesJahr}

Der aktuelle Monat heisst ${h.monatsName}, der naechste ${h.naechsterMonatsName}.
Konkrete Datumsangaben wie "01.10.2026" oder "1.10." wandelst du selbst in
YYYY-MM-DD um. Fehlt das Jahr, nimm das naechste Vorkommen ab heute.

WICHTIG: "naechster Monat" IST eindeutig bestimmbar (siehe oben). Schreibe NIE,
dass ein relatives Datum nicht umwandelbar sei – verwende den vorgerechneten Wert.

== ARBEITSZEIT ==
Eine Vollzeitstelle = ${vollzeitStunden} Wochenstunden = 100 %.
- "auf 20 (Stunden)", "20 Wochenstunden", "reduzieren auf 20" -> neuStunden=20
- "von 35 auf 30" -> altStunden=35, neuStunden=30
- "halbtags" / "Halbzeit" / "50 %" -> ausmassProzent=50, neuStunden=${halbzeit}
- "Vollzeit" / "100 %" -> ausmassProzent=100, neuStunden=${vollzeitStunden}
- Ist nur Stunden genannt, berechne Prozent (= Stunden / ${vollzeitStunden} * 100, gerundet).
- Ist nur Prozent genannt, berechne Stunden. Abgeleitete Werte im hinweis vermerken.

== ANTWORTFORMAT ==
Antworte AUSSCHLIESSLICH mit gueltigem JSON, ohne Markdown, ohne Code-Bloecke:

{"personPlatzhalter": string|null, "neuStunden": number|null, "altStunden": number|null, "ausmassProzent": number|null, "gueltigAb": string|null, "konfidenz": number, "hinweis": string|null}

== KONFIDENZ ==
- >= 0.85 nur wenn Person, neue Arbeitszeit UND Datum klar sind.
- 0.5-0.8 bei abgeleiteten/geschaetzten Werten (z. B. Prozent aus Stunden).
- Fehlt ein Wert wirklich, setze null. Erfinde nichts.
- hinweis kurz auf Deutsch, nur wenn etwas geschaetzt/angenommen wurde.

== BEISPIELE ==
"PERSON_1 aendert Stunden von 35 auf 30 ab 01.10.2026"
-> {"personPlatzhalter":"PERSON_1","neuStunden":30,"altStunden":35,"ausmassProzent":78,"gueltigAb":"2026-10-01","konfidenz":0.9,"hinweis":"Ausmass aus 30 Std berechnet"}

"frau PERSON_2 will ihre stunden auf 22 aendern ab naechsten monat"
-> {"personPlatzhalter":"PERSON_2","neuStunden":22,"altStunden":null,"ausmassProzent":57,"gueltigAb":"${h.ersterNaechsterMonat}","konfidenz":0.8,"hinweis":"Datum = erster des naechsten Monats; Ausmass aus 22 Std berechnet"}

"PERSON_3 ab sofort auf Halbzeit"
-> {"personPlatzhalter":"PERSON_3","neuStunden":${halbzeit},"altStunden":null,"ausmassProzent":50,"gueltigAb":"${h.heute}","konfidenz":0.65,"hinweis":"Halbzeit=50%, Stunden geschaetzt"}

Gib jetzt fuer die folgende Mitteilung NUR das JSON zurueck.`;
}
