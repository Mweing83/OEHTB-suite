import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";

// Abschnitt: IMAP-Postfach (E-Mail-Abruf)
interface ImapKonfigUI {
  aktiv: boolean;
  host: string;
  port: number;
  secure: boolean;
  benutzer: string;
  intervallMinuten: number;
  passwortGesetzt: boolean;
}

export default function ImapEinstellungen() {
  const [aktiv, setAktiv] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [benutzer, setBenutzer] = useState("");
  const [intervall, setIntervall] = useState(15);
  const [passwort, setPasswort] = useState("");
  const [passwortGesetzt, setPasswortGesetzt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [ruftAb, setRuftAb] = useState(false);
  const [abrufMeldung, setAbrufMeldung] = useState<string | null>(null);

  const laden = useCallback(() => {
    api.get<ImapKonfigUI>("/api/admin/imap").then((k) => {
      setAktiv(k.aktiv);
      setHost(k.host);
      setPort(k.port);
      setSecure(k.secure);
      setBenutzer(k.benutzer);
      setIntervall(k.intervallMinuten);
      setPasswortGesetzt(k.passwortGesetzt);
    });
  }, []);
  useEffect(laden, [laden]);

  async function speichern() {
    setSpeichert(true);
    setMeldung(null);
    try {
      await api.put("/api/admin/imap", {
        aktiv,
        host,
        port,
        secure,
        benutzer,
        intervallMinuten: intervall,
        passwort, // leer = unveraendert
      });
      setPasswort("");
      setMeldung("Gespeichert.");
      laden();
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setSpeichert(false);
    }
  }

  async function jetztAbrufen() {
    setRuftAb(true);
    setAbrufMeldung(null);
    try {
      const r = await api.post<{ abgerufen: number; fehler: string | null }>(
        "/api/admin/imap/abrufen"
      );
      if (r.fehler) {
        setAbrufMeldung(`Fehler: ${r.fehler}`);
      } else {
        setAbrufMeldung(`${r.abgerufen} Mail(s) verarbeitet.`);
      }
    } catch (err) {
      setAbrufMeldung(err instanceof Error ? err.message : "Fehler.");
    } finally {
      setRuftAb(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-xs p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">E-Mail-Abruf (IMAP)</h3>
          <p className="text-xs text-gray-500">
            Ruft ungelesene Mails ab und legt sie als Anfragen in die Queue.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={aktiv}
            onChange={(e) => setAktiv(e.target.checked)}
          />
          Automatischer Abruf aktiv
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Server (Host)</label>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="imap.dienstleister.at"
            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
              />
              TLS
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Benutzer</label>
          <input
            value={benutzer}
            onChange={(e) => setBenutzer(e.target.value)}
            placeholder="postfach@dienstleister.at"
            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Passwort{" "}
            {passwortGesetzt && (
              <span className="text-green-600 text-xs">
                (gesetzt – leer lassen zum Beibehalten)
              </span>
            )}
          </label>
          <input
            type="password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            placeholder={passwortGesetzt ? "•••••••• (unverändert)" : "Passwort"}
            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Abruf-Intervall (Minuten)
          </label>
          <input
            type="number"
            value={intervall}
            onChange={(e) => setIntervall(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={speichern}
          disabled={speichert}
          className="bg-marke-600 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-700 disabled:opacity-50"
        >
          {speichert ? "Speichern …" : "Speichern"}
        </button>
        <button
          onClick={jetztAbrufen}
          disabled={ruftAb}
          className="bg-gray-200 text-gray-700 rounded-sm px-4 py-2 text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
        >
          {ruftAb ? "Rufe ab …" : "Jetzt manuell abrufen"}
        </button>
        {meldung && <span className="text-sm text-gray-600">{meldung}</span>}
        {abrufMeldung && (
          <span className="text-sm text-gray-600">{abrufMeldung}</span>
        )}
      </div>
    </div>
  );
}
