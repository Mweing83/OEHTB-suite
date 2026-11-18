import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile } from "./gemeinsam.js";

// Reiter Datensicherung (Backup).

interface BackupKonfig {
  id: number;
  uhrzeit: string;
  aufbewahrungTaeglich: number;
  aufbewahrungMonatlich: number;
  zielNasAktiv: boolean;
  zielUsbAktiv: boolean;
  pfadLokal: string | null;
  laufAngefordert: boolean;
  letzterLaufAm: string | null;
  letzterErfolg: boolean;
  letzteMeldung: string | null;
  bericht: string | null;
}

interface BackupDatei { ordner: string; name: string; groesseBytes: number; erstelltAm: string; }

function dateiGroesse(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

function VerzeichnisBrowser({
  startPfad,
  onAuswaehlen,
  onAbbrechen,
}: {
  startPfad: string;
  onAuswaehlen: (pfad: string) => void;
  onAbbrechen: () => void;
}) {
  const [pfad, setPfad] = useState("");
  const [pfadEingabe, setPfadEingabe] = useState("");
  const [ordner, setOrdner] = useState<string[]>([]);
  const [elternpfad, setElternpfad] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function navigieren(ziel: string) {
    setLaeuft(true);
    setFehler("");
    try {
      const r = await api.get<{ pfad: string; ordner: string[]; elternpfad: string | null }>(
        `/admin/verzeichnis?pfad=${encodeURIComponent(ziel)}`
      );
      setPfad(r.pfad);
      setPfadEingabe(r.pfad);
      setOrdner(r.ordner);
      setElternpfad(r.elternpfad);
    } catch (e) {
      setFehler((e as Error).message);
      // Ungültiger Startpfad (außerhalb des Sicherungsbereichs): dort beginnen.
      if (ziel !== "") {
        setLaeuft(false);
        return navigieren("");
      }
    } finally {
      setLaeuft(false);
    }
  }

  // Nur beim Öffnen des Dialogs zum Startpfad springen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { navigieren(startPfad || ""); }, []);

  function unterordnerPfad(name: string): string {
    if (pfad === "") return name; // Windows-Laufwerksliste: name ist bereits vollständiger Pfad
    const sep = pfad.includes("\\") ? "\\" : "/";
    return pfad.endsWith(sep) ? pfad + name : pfad + sep + name;
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="font-semibold text-marke-900 text-sm flex-1">Ordner wählen</span>
          <button onClick={onAbbrechen} className="text-slate-500 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>

        <div className="px-3 py-2 border-b bg-slate-50 flex items-center gap-2">
          {elternpfad !== null && (
            <button onClick={() => navigieren(elternpfad)}
              className="text-xs px-2 py-1 rounded-sm border bg-white hover:bg-slate-50 text-slate-600 whitespace-nowrap">
              ↑ Hoch
            </button>
          )}
          <input
            className="flex-1 text-xs font-mono border rounded-sm px-2 py-1 bg-white"
            value={pfadEingabe}
            onChange={(e) => setPfadEingabe(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") navigieren(pfadEingabe); }}
            placeholder="Pfad eingeben und Enter drücken…"
          />
          <button onClick={() => navigieren(pfadEingabe)}
            className="text-xs px-2 py-1 rounded-sm border bg-white hover:bg-slate-50 text-slate-600">
            →
          </button>
        </div>

        <div className="overflow-y-auto flex-1 py-1">
          {fehler && <p className="text-sm text-red-600 px-4 py-2">{fehler}</p>}
          {laeuft && <p className="text-sm text-slate-500 px-4 py-2">Lade…</p>}
          {!laeuft && !fehler && ordner.length === 0 && (
            <p className="text-sm text-slate-500 px-4 py-2">Keine Unterordner vorhanden.</p>
          )}
          {ordner.map((name) => (
            <button key={name} onClick={() => navigieren(unterordnerPfad(name))}
              className="w-full text-left px-4 py-1.5 text-sm hover:bg-marke-50 flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="font-mono">{name}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 font-mono truncate">{pfad || "—"}</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={onAbbrechen} className="px-3 py-1.5 text-sm text-slate-600 hover:underline">Abbrechen</button>
            <button onClick={() => onAuswaehlen(pfad)} disabled={!pfad}
              className="bg-marke-700 text-white rounded-sm px-4 py-1.5 text-sm font-medium hover:bg-marke-800 disabled:opacity-50">
              Auswählen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BackupTab() {
  const [konfig, setKonfig] = useState<BackupKonfig | null>(null);
  const [form, setForm] = useState({
    uhrzeit: "02:00",
    aufbewahrungTaeglich: "14",
    aufbewahrungMonatlich: "12",
    zielNasAktiv: true,
    zielUsbAktiv: true,
    pfadLokal: "",
  });
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [dateien, setDateien] = useState<BackupDatei[] | null>(null);
  const [dateienPfad, setDateienPfad] = useState("");
  const [pruef, setPruef] = useState<Record<string, { laeuft?: boolean; ok?: boolean; meldung?: string }>>({});
  const [browser, setBrowser] = useState<"lokal" | null>(null);

  function laden() {
    api.get<BackupKonfig>("/admin/backup").then((k) => {
      setKonfig(k);
      setForm({
        uhrzeit: k.uhrzeit,
        aufbewahrungTaeglich: String(k.aufbewahrungTaeglich),
        aufbewahrungMonatlich: String(k.aufbewahrungMonatlich),
        zielNasAktiv: k.zielNasAktiv,
        zielUsbAktiv: k.zielUsbAktiv,
        pfadLokal: k.pfadLokal ?? "",
      });
    }).catch(() => {});
  }
  useEffect(laden, []);

  async function speichern() {
    setFehler(""); setHinweis("");
    const t = parseInt(form.aufbewahrungTaeglich, 10);
    const m = parseInt(form.aufbewahrungMonatlich, 10);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.uhrzeit)) { setFehler("Uhrzeit im Format HH:MM angeben."); return; }
    if (isNaN(t) || t < 1) { setFehler("Aufbewahrung (täglich) muss mindestens 1 sein."); return; }
    if (isNaN(m) || m < 0) { setFehler("Aufbewahrung (monatlich) ist ungültig."); return; }
    try {
      await api.put("/admin/backup", {
        uhrzeit: form.uhrzeit,
        aufbewahrungTaeglich: t,
        aufbewahrungMonatlich: m,
        zielNasAktiv: form.zielNasAktiv,
        zielUsbAktiv: form.zielUsbAktiv,
        // null (nicht undefined) leert den Pfad in der DB zurück auf den Standard.
        pfadLokal: form.pfadLokal.trim() || null,
      });
      setHinweis("Einstellungen gespeichert.");
      laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function jetztSichern() {
    setFehler(""); setHinweis("");
    try {
      await api.post("/admin/backup/jetzt");
      setHinweis("Sicherung angefordert – sie wird innerhalb einer halben Minute ausgeführt. Danach auf „Aktualisieren“ klicken.");
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  function dateienLaden() {
    api.get<{ pfad: string; gefunden: boolean; dateien: BackupDatei[] }>("/admin/backup/dateien")
      .then((r) => { setDateien(r.dateien); setDateienPfad(r.pfad); })
      .catch((e) => setFehler((e as Error).message));
  }

  async function pruefen(d: BackupDatei) {
    const key = `${d.ordner}/${d.name}`;
    setPruef((p) => ({ ...p, [key]: { laeuft: true } }));
    try {
      const r = await api.post<{ ok: boolean; meldung: string }>("/admin/backup/pruefen", { ordner: d.ordner, name: d.name });
      setPruef((p) => ({ ...p, [key]: { ok: r.ok, meldung: r.meldung } }));
    } catch (e) {
      setPruef((p) => ({ ...p, [key]: { ok: false, meldung: (e as Error).message } }));
    }
  }

  return (
    <>
      <Karte titel="Status">
        <Fehlerzeile text={fehler} />
        {hinweis && (
          <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">{hinweis}</div>
        )}
        {konfig && (
          <div className="space-y-2 text-sm">
            <div>
              Letzte Sicherung:{" "}
              {konfig.letzterLaufAm ? (
                <>
                  <span className="font-medium">{new Date(konfig.letzterLaufAm).toLocaleString("de-AT")}</span>{" "}
                  {konfig.letzterErfolg
                    ? <span className="text-green-700">erfolgreich</span>
                    : <span className="text-red-700">fehlgeschlagen</span>}
                </>
              ) : <span className="text-slate-500">noch keine</span>}
            </div>
            {konfig.letzteMeldung && <div className="text-slate-600">{konfig.letzteMeldung}</div>}
            {konfig.laufAngefordert && (
              <div className="text-amber-600">Eine Sicherung ist angefordert und wird in Kürze ausgeführt…</div>
            )}
            {konfig.bericht && (
              <pre className="mt-2 bg-slate-50 border rounded-sm p-3 text-xs whitespace-pre-wrap text-slate-700">{konfig.bericht}</pre>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-3 items-center">
          <button onClick={jetztSichern} className="bg-marke-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-800">Jetzt sichern</button>
          <button onClick={laden} className="text-sm text-marke-700 hover:underline">Aktualisieren</button>
        </div>
      </Karte>

      <Karte titel="Sicherungen (lokal)">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={dateienLaden} className="bg-marke-700 text-white rounded-sm px-4 py-2 text-sm font-medium hover:bg-marke-800">
            {dateien === null ? "Sicherungen anzeigen" : "Aktualisieren"}
          </button>
          {dateienPfad && <span className="text-xs text-slate-500">Ordner: {dateienPfad}</span>}
        </div>

        {dateien !== null && dateien.length === 0 && (
          <p className="text-sm text-slate-500">Keine lokalen Sicherungen gefunden.</p>
        )}

        {dateien !== null && dateien.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Ablage</th><th>Datei</th><th className="text-right">Größe</th><th>Datum</th><th></th>
              </tr>
            </thead>
            <tbody>
              {dateien.map((d) => {
                const key = `${d.ordner}/${d.name}`;
                const p = pruef[key];
                return (
                  <tr key={key} className="border-b last:border-0 align-top">
                    <td className="py-2">{d.ordner}</td>
                    <td className="font-mono text-xs">{d.name}</td>
                    <td className="text-right whitespace-nowrap">{dateiGroesse(d.groesseBytes)}</td>
                    <td className="whitespace-nowrap">{new Date(d.erstelltAm).toLocaleString("de-AT")}</td>
                    <td className="text-right">
                      <button onClick={() => pruefen(d)} disabled={p?.laeuft}
                        className="text-xs text-marke-700 hover:underline disabled:opacity-60">
                        {p?.laeuft ? "prüfe…" : "prüfen"}
                      </button>
                      {p && !p.laeuft && p.meldung && (
                        <div className={`mt-1 text-xs text-left ${p.ok ? "text-green-700" : "text-red-600"}`}>
                          {p.ok ? "✓ " : "✗ "}{p.meldung}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500 mt-3">
          „prüfen“ kontrolliert, ob das Archiv lesbar ist und die erwarteten Inhalte
          (Datenbank + Info) enthält. NAS-/USB-Stände werden hier nicht aufgelistet.
        </p>
      </Karte>

      <Karte titel="Einstellungen">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Uhrzeit (täglich)</label>
            <input type="time" className="w-full border rounded-sm px-3 py-2" value={form.uhrzeit}
              onChange={(e) => setForm({ ...form, uhrzeit: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Aufbewahrung täglich</label>
            <input type="number" min={1} className="w-full border rounded-sm px-3 py-2 text-right" value={form.aufbewahrungTaeglich}
              onChange={(e) => setForm({ ...form, aufbewahrungTaeglich: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Aufbewahrung monatlich</label>
            <input type="number" min={0} className="w-full border rounded-sm px-3 py-2 text-right" value={form.aufbewahrungMonatlich}
              onChange={(e) => setForm({ ...form, aufbewahrungMonatlich: e.target.value })} />
          </div>
          <button onClick={speichern} className="bg-marke-700 text-white rounded-sm py-2 font-medium hover:bg-marke-800">Speichern</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.zielNasAktiv} onChange={(e) => setForm({ ...form, zielNasAktiv: e.target.checked })} />
            Auf NAS sichern
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.zielUsbAktiv} onChange={(e) => setForm({ ...form, zielUsbAktiv: e.target.checked })} />
            Auf USB sichern
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Es wird täglich um die eingestellte Uhrzeit gesichert. Jahresstände (jeweils 1. Jänner)
          bleiben dauerhaft erhalten – unabhängig von der Aufbewahrung der Tages- und Monatsstände.
        </p>
      </Karte>

      <Karte titel="Lokaler Anzeige-Pfad">
        <p className="text-sm text-slate-500 mb-4">
          Aus diesem Ordner liest die App die lokalen Sicherungen für die Liste und die Prüfung oben.
          Leer lassen, um den Server-Standardpfad (aus <code className="bg-slate-100 px-1 rounded-sm">.env</code>) zu verwenden.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">Lokal</label>
          <div className="flex gap-2">
            <input className="flex-1 border rounded-sm px-3 py-2 text-sm font-mono" placeholder="Standard aus .env"
              value={form.pfadLokal} onChange={(e) => setForm({ ...form, pfadLokal: e.target.value })} />
            <button type="button" onClick={() => setBrowser("lokal")}
              className="px-3 py-2 text-sm border rounded-sm hover:bg-slate-50 whitespace-nowrap text-slate-600">
              Durchsuchen…
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Hinweis: <strong>Wohin</strong> gesichert wird (lokal, NAS, USB), wird am Server in der
          Datei <code className="bg-slate-100 px-1 rounded-sm">.env</code> festgelegt – nicht hier.
          Dieser Pfad beeinflusst nur die Anzeige. Änderungen werden beim Klick auf „Speichern" übernommen.
        </p>
      </Karte>

      {browser !== null && (
        <VerzeichnisBrowser
          startPfad={form.pfadLokal}
          onAuswaehlen={(pfad) => {
            setForm((f) => ({ ...f, pfadLokal: pfad }));
            setBrowser(null);
          }}
          onAbbrechen={() => setBrowser(null)}
        />
      )}
    </>
  );
}
