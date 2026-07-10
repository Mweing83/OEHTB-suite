import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

// Gemeinsames Seitenlayout mit Kopfzeile und Navigation.
export default function Layout({ children }: { children: ReactNode }) {
  const { benutzer, abmelden } = useAuth();
  const ort = useLocation();

  const navLink = (pfad: string, text: string) => {
    const aktiv = ort.pathname === pfad;
    return (
      <Link
        to={pfad}
        className={
          "px-3 py-2 rounded text-sm font-medium " +
          (aktiv
            ? "bg-blue-100 text-blue-800"
            : "text-gray-600 hover:bg-gray-100")
        }
      >
        {text}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-gray-800">
              Stunden-Tool ÖHTB
            </h1>
            <nav className="flex items-center gap-1">
              <a
                href="/"
                className="px-3 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                ← Portal
              </a>
              {navLink("/", "Dashboard")}
              {navLink("/anfragen", "Anfragen")}
              {navLink("/mitarbeiter", "Mitarbeiter")}
              {benutzer?.rolle === "ADMIN" && navLink("/admin", "Administration")}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              {benutzer?.name ?? benutzer?.email}{" "}
              <span className="text-gray-400">({benutzer?.rolle})</span>
            </span>
            <button
              onClick={() => abmelden()}
              className="text-blue-600 hover:underline"
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
