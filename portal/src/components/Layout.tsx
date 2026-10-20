import { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../lib/auth";

// Gemeinsames Suite-Layout: markante Kopfleiste (Marken-Navy), einheitlich mit
// den Werkzeugen Handkassen und Stunden. Das Portal ist der Startpunkt und hat
// selbst keine Unter-Navigation (die Kacheln auf der Startseite fuehren weiter).
export default function Layout({ children }: { children: ReactNode }) {
  const { benutzer, abmelden } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-marke-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">ÖHTB</span>
            <span className="text-marke-300" aria-hidden="true">
              ·
            </span>
            <span className="text-base font-medium text-marke-100">
              Tool-Suite
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-marke-200">{benutzer?.name}</span>
            <button
              onClick={() => abmelden()}
              className="rounded-md bg-marke-800 px-3 py-1.5 font-medium hover:bg-marke-700"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
