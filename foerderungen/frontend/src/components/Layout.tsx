import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Ausschreibung, Foerderquelle } from "../lib/typen";

// Gemeinsames Seitenlayout mit markanter Kopfleiste (Marken-Navy) und
// Navigation – einheitlich mit Portal, Handkassen und Stunden.
export default function Layout({ children }: { children: ReactNode }) {
  const { benutzer, abmelden } = useAuth();
  const ort = useLocation();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    // Anzahl wartender Vorschlaege (Quellen + Ausschreibungen) fuer den Badge.
    Promise.all([
      api.get<Ausschreibung[]>("/api/ausschreibungen?status=VORGESCHLAGEN"),
      api.get<Foerderquelle[]>("/api/quellen?status=VORGESCHLAGEN"),
    ])
      .then(([a, q]) => setBadge(a.length + q.length))
      .catch(() => setBadge(0));
  }, [ort.pathname]);

  const navLink = (pfad: string, text: string, extra?: ReactNode) => {
    const aktiv = ort.pathname === pfad;
    return (
      <Link
        to={pfad}
        aria-current={aktiv ? "page" : undefined}
        className={
          "px-3 py-2 rounded-md text-sm font-medium inline-flex items-center gap-1.5 " +
          (aktiv ? "bg-marke-700 text-white" : "text-marke-100 hover:bg-marke-800")
        }
      >
        {text}
        {extra}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-marke-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">ÖHTB</span>
            <span className="text-marke-300" aria-hidden="true">·</span>
            <span className="text-base font-medium text-marke-100">Förderungen</span>
          </div>
          <nav className="flex items-center gap-1 flex-wrap">
            <a
              href="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-marke-100 hover:bg-marke-800"
            >
              ← Portal
            </a>
            {navLink("/", "Ausschreibungen")}
            {navLink("/landschaft", "Förderlandschaft")}
            {navLink(
              "/pruefen",
              "Prüfen",
              badge > 0 ? (
                <span className="rounded-full bg-warnung-600 text-white text-xs px-1.5 py-0.5 leading-none">
                  {badge}
                </span>
              ) : undefined
            )}
            {navLink("/scans", "Scans")}
            {navLink("/einstellungen", "Einstellungen")}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-marke-200">{benutzer?.name ?? benutzer?.email}</span>
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
