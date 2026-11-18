import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

// Gemeinsame Bausteine und Typen der Verwaltungs-Reiter.

export function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
      <h2 className="font-semibold text-marke-900 mb-4">{titel}</h2>
      {children}
    </div>
  );
}

export function Fehlerzeile({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
      {text}
    </div>
  );
}

export function StatusKnopf({ aktiv, onClick }: { aktiv: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded ${
        aktiv ? "text-red-600 hover:bg-red-50" : "text-green-700 hover:bg-green-50"
      }`}
    >
      {aktiv ? "deaktivieren" : "aktivieren"}
    </button>
  );
}

// Bearbeiten-Link (startet den Inline-Bearbeitungsmodus einer Zeile)
export function BearbeitenKnopf({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs text-marke-700 hover:underline">
      bearbeiten
    </button>
  );
}

// Speichern/Abbrechen-Paar im Inline-Bearbeitungsmodus
export function SpeichernAbbrechen({ onSpeichern, onAbbrechen }: { onSpeichern: () => void; onAbbrechen: () => void }) {
  return (
    <>
      <button onClick={onSpeichern} className="text-xs text-marke-700 font-medium hover:underline">speichern</button>
      <button onClick={onAbbrechen} className="text-xs text-slate-500 hover:underline">abbrechen</button>
    </>
  );
}

// Einheitliche, kompakte Eingabefelder für die Inline-Bearbeitung in Tabellen
export const zelleInput = "w-full border rounded-sm px-2 py-1 text-sm";

export interface Benutzer {
  id: number;
  benutzername: string;
  name: string;
  rolle: string;
  aktiv: boolean;
  passwortSetzen: boolean;
  kostenstellen: { kostenstelleId: number }[];
}
export interface Kostenstelle {
  id: number;
  firmaId: number;
  firma: { id: number; name: string };
  nummer: string;
  bezeichnung: string;
  gegenkonto: string | null;
  bereichId: number;
  kassenartId: number;
  bereich: { id: number; bezeichnung: string };
  kassenart: { id: number; bezeichnung: string };
  anfangssaldoCent: number;
  saldoCent: number;
  aktiv: boolean;
  belegStartnummer: number | null;
  belegStartJahr: number | null;
}
// Stammdaten-Eintrag für Bereich bzw. Kassenart
export interface Stammwert { id: number; bezeichnung: string; aktiv: boolean; }

export interface Firma { id: number; name: string; aktiv: boolean; }

// Lädt die Firmen für Auswahlfelder (Kostenstellen, Kontenplan).
export function useFirmen(): Firma[] {
  const [firmen, setFirmen] = useState<Firma[]>([]);
  useEffect(() => {
    api.get<Firma[]>("/admin/firmen").then(setFirmen).catch(() => {});
  }, []);
  return firmen;
}
