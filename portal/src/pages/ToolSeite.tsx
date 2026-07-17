import { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";

// Startseite des Portals: eine Kachel je freigeschaltetem Tool.
// Jede Kachel traegt ein sprechendes Symbol (Inline-SVG, keine Bibliothek):
// Handkassen = Kassette mit Muenze, Stunden = Uhr, Foerderungen = Euro mit
// Wachstumspfeil, Verwaltung = Regler. Unbekannte kuenftige Tools bekommen
// ein neutrales Raster. Farbwelt bleibt das Suite-Navy (marke-Tokens).

const SYMBOL_KLASSE = "h-7 w-7";

function toolSymbol(slug: string): ReactNode {
  switch (slug) {
    case "handkassen":
      // Geldkassette mit eingeworfener Muenze
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={SYMBOL_KLASSE} aria-hidden="true">
          <rect x="3" y="9" width="18" height="11" rx="2" />
          <path d="M3 13h18" />
          <circle cx="12" cy="5" r="2.4" />
          <path d="M10 16.5h4" />
        </svg>
      );
    case "stunden":
      // Uhr
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={SYMBOL_KLASSE} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2.5" />
        </svg>
      );
    case "foerderungen":
      // Euro mit Wachstumspfeil (Foerdermittel)
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={SYMBOL_KLASSE} aria-hidden="true">
          <path d="M14.5 6.8a5.2 5.2 0 1 0 0 8.9" />
          <path d="M7 10.4h5.5M7 13.6h4.5" />
          <path d="M16.5 9.5 21 5m0 0h-3.6M21 5v3.6" />
        </svg>
      );
    case "verwaltung":
      // Regler (Rechte & Einstellungen)
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={SYMBOL_KLASSE} aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h13M20 17h.5" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18.5" cy="17" r="2" />
        </svg>
      );
    default:
      // Neutrales Raster fuer kuenftige Tools
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={SYMBOL_KLASSE} aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      );
  }
}

export default function ToolSeite() {
  const { benutzer } = useAuth();

  return (
    <Layout>
      <h2 className="text-2xl font-semibold text-gray-800 mb-1">
        Willkommen, {benutzer?.name}
      </h2>
      <p className="text-sm text-gray-500 mb-8">
        Wählen Sie ein Tool, für das Sie freigeschaltet sind.
      </p>

      {benutzer && benutzer.tools.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-gray-500 text-sm">
          Für Ihr Konto ist aktuell kein Tool freigeschaltet. Bitte an die
          Verwaltung wenden.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {benutzer?.tools.map((tool) => (
            <a
              key={tool.slug}
              href={tool.pfad}
              className="group relative bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col
                         transition-all hover:border-marke-400 hover:shadow-md hover:-translate-y-0.5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marke-500 focus-visible:ring-offset-2
                         motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start justify-between mb-4">
                <span
                  className="inline-flex items-center justify-center h-12 w-12 rounded-lg
                             bg-marke-50 text-marke-700 transition-colors
                             group-hover:bg-marke-600 group-hover:text-white"
                >
                  {toolSymbol(tool.slug)}
                </span>
                <span
                  className="text-marke-300 transition-all group-hover:text-marke-600 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
              <h3 className="text-base font-semibold text-gray-800">{tool.name}</h3>
              {tool.beschreibung && (
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{tool.beschreibung}</p>
              )}
              <p className="mt-auto pt-4">
                <span className="inline-block rounded-full bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1">
                  Rolle: {benutzer.zugriff[tool.slug]}
                </span>
              </p>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}
