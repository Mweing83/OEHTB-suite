// Gemeinsam genutzte Typen und Lade-Hooks der Handkassen-Oberfläche.
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// Kostenstelle, wie sie GET /kostenstellen liefert (nur die dem Benutzer
// zugänglichen; Admin/Finanzen: alle).
export interface Kostenstelle {
  id: number;
  nummer: string;
  bezeichnung: string;
  bereich: { id: number; bezeichnung: string };
  firma: { id: number; name: string };
  saldoCent: number;
}

// Lädt die Kostenstellen des Benutzers. `neuLaden` holt sie erneut, z. B. um
// nach einer Buchung den Kassenstand zu aktualisieren.
export function useKostenstellen(): { kostenstellen: Kostenstelle[]; neuLaden: () => void } {
  const [kostenstellen, setKostenstellen] = useState<Kostenstelle[]>([]);
  const neuLaden = useCallback(() => {
    api
      .get<Kostenstelle[]>("/kostenstellen")
      .then(setKostenstellen)
      .catch(() => setKostenstellen([]));
  }, []);
  useEffect(neuLaden, [neuLaden]);
  return { kostenstellen, neuLaden };
}

// Durch Löschen frei gewordene, noch offene Belegnummern (Lücke). `pfad` ist
// die Abfrage (für eine Kostenstelle bzw. für den Export einer Firma) oder
// null, solange die Auswahl unvollständig ist. `neuLadenBei` löst ein
// erneutes Laden aus, wenn es sich ändert (z. B. die Buchungsliste).
export function useFreieNummern(pfad: string | null, neuLadenBei?: unknown): string[] {
  const [nummern, setNummern] = useState<string[]>([]);
  useEffect(() => {
    if (!pfad) {
      setNummern([]);
      return;
    }
    api
      .get<{ belegnummer: string }[]>(pfad)
      .then((liste) => setNummern(liste.map((f) => f.belegnummer)))
      .catch(() => setNummern([]));
  }, [pfad, neuLadenBei]);
  return nummern;
}

// Gültige Periode für Abfragen? (Jahr/Monat kommen teils aus Zahlenfeldern.)
export function periodeGueltig(jahr: number, monat: number): boolean {
  return Number.isInteger(jahr) && jahr >= 2000 && jahr <= 2100 && Number.isInteger(monat) && monat >= 1 && monat <= 12;
}
