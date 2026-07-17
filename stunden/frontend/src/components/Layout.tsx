import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

// Gemeinsames Seitenlayout mit markanter Kopfleiste (Marken-Navy) und
// Navigation – einheitlich mit Portal und Handkassen.
export default function Layout({ children }: { children: ReactNode }) {
  const { benutzer, abmelden } = useAuth();
  const ort = useLocation();

  const navLink = (pfad: string, text: string) => {
    const aktiv = ort.pathname === pfad;
    return (
      <Link
        to={pfad}
        aria-current={aktiv ? "page" : undefined}
        className={
          "px-3 py-2 rounded-md text-sm font-medium " +
          (aktiv
            ? "bg-marke-700 text-white"
            : "text-marke-100 hover:bg-marke-800")
        }
      >
        {text}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-marke-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">ÖHTB</span>
            <span className="text-marke-300" aria-hidden="true">
              ·
            </span>
            <span className="text-base font-medium text-marke-100">Stunden</span>
          </div>
          <nav className="flex items-center gap-1 flex-wrap">
            <a
              href="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-marke-100 hover:bg-marke-800"
            >
              ← Portal
            </a>
            {navLink("/", "Dashboard")}
            {navLink("/anfragen", "Anfragen")}
            {navLink("/mitarbeiter", "Mitarbeiter")}
            {benutzer?.rolle === "admin" && navLink("/admin", "Verwaltung")}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-marke-200">
              {benutzer?.name ?? benutzer?.email}{" "}
              <span className="text-marke-300">({benutzer?.rolle})</span>
            </span>
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
