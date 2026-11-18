import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Karte, Fehlerzeile } from "./gemeinsam.js";

// Reiter Kontakt (Kontaktdaten des Administrators).

export default function KontaktTab() {
  const [form, setForm] = useState({ kontaktName: "", kontaktEmail: "", kontaktTelefon: "", kontaktHinweis: "" });
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");

  useEffect(() => {
    api
      .get<{ kontaktName?: string; kontaktEmail?: string; kontaktTelefon?: string; kontaktHinweis?: string }>("/admin/allgemein")
      .then((k) =>
        setForm({
          kontaktName: k.kontaktName ?? "",
          kontaktEmail: k.kontaktEmail ?? "",
          kontaktTelefon: k.kontaktTelefon ?? "",
          kontaktHinweis: k.kontaktHinweis ?? "",
        })
      )
      .catch(() => {});
  }, []);

  async function speichern() {
    setFehler(""); setHinweis("");
    try {
      await api.put("/admin/allgemein", form);
      setHinweis("Kontaktdaten gespeichert.");
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  return (
    <Karte titel="Kontaktdaten (für alle Nutzer sichtbar)">
      <Fehlerzeile text={fehler} />
      {hinweis && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">{hinweis}</div>}
      <div className="space-y-3 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-1">Name / Funktion</label>
          <input className="w-full border rounded-sm px-3 py-2" value={form.kontaktName}
            onChange={(e) => setForm({ ...form, kontaktName: e.target.value })}
            placeholder="z. B. Max Mustermann (Administration)" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-Mail</label>
          <input type="email" className="w-full border rounded-sm px-3 py-2" value={form.kontaktEmail}
            onChange={(e) => setForm({ ...form, kontaktEmail: e.target.value })}
            placeholder="name@oehtb.at" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Telefon</label>
          <input className="w-full border rounded-sm px-3 py-2" value={form.kontaktTelefon}
            onChange={(e) => setForm({ ...form, kontaktTelefon: e.target.value })}
            placeholder="z. B. +43 1 234 56 78" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Hinweis (optional)</label>
          <textarea className="w-full border rounded-sm px-3 py-2" rows={3} value={form.kontaktHinweis}
            onChange={(e) => setForm({ ...form, kontaktHinweis: e.target.value })}
            placeholder="z. B. Erreichbarkeit, Zuständigkeit…" />
        </div>
        <button onClick={speichern} className="bg-marke-700 text-white rounded-sm px-5 py-2 font-medium hover:bg-marke-800">Speichern</button>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Diese Angaben sehen alle angemeldeten Nutzer im Menüpunkt „Kontakt“.
      </p>
    </Karte>
  );
}
