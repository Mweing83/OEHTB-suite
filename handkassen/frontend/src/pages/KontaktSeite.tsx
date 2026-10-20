import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface Kontakt {
  name: string;
  email: string;
  telefon: string;
  hinweis: string;
}

// Kontaktseite: zeigt die vom Administrator hinterlegten Kontaktdaten.
// Für alle angemeldeten Nutzer sichtbar (nur lesend).
export default function KontaktSeite() {
  const [k, setK] = useState<Kontakt | null>(null);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    api
      .get<Kontakt>("/kontakt")
      .then(setK)
      .catch(() => {})
      .finally(() => setGeladen(true));
  }, []);

  const leer = !!k && !k.name && !k.email && !k.telefon && !k.hinweis;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-marke-900 mb-1">Kontakt</h1>
      <p className="text-sm text-slate-500 mb-4">Ansprechpartner bei Fragen zum Handkassen-System.</p>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {!geladen ? (
          <p className="text-slate-500">Lädt…</p>
        ) : leer ? (
          <p className="text-slate-500">Es sind noch keine Kontaktdaten hinterlegt.</p>
        ) : (
          <dl className="space-y-4 text-sm">
            {k?.name && (
              <div>
                <dt className="text-slate-500">Ansprechpartner</dt>
                <dd className="font-medium text-slate-800">{k.name}</dd>
              </div>
            )}
            {k?.email && (
              <div>
                <dt className="text-slate-500">E-Mail</dt>
                <dd>
                  <a href={`mailto:${k.email}`} className="text-marke-700 hover:underline">
                    {k.email}
                  </a>
                </dd>
              </div>
            )}
            {k?.telefon && (
              <div>
                <dt className="text-slate-500">Telefon</dt>
                <dd>
                  <a href={`tel:${k.telefon.replace(/\s+/g, "")}`} className="text-marke-700 hover:underline">
                    {k.telefon}
                  </a>
                </dd>
              </div>
            )}
            {k?.hinweis && (
              <div>
                <dt className="text-slate-500">Hinweis</dt>
                <dd className="text-slate-800 whitespace-pre-wrap">{k.hinweis}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
