import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Layout({ children }: { children: ReactNode }) {
  const { benutzer, abmelden } = useAuth();
  const istVerwalter = benutzer?.zugriff["verwaltung"] === "admin";

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold text-gray-800">
            ÖHTB Tool-Suite
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-gray-600 hover:text-gray-900">
              ← Portal
            </Link>
            {istVerwalter && (
              <Link to="/verwaltung" className="text-gray-600 hover:text-gray-900">
                Verwaltung
              </Link>
            )}
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">{benutzer?.name}</span>
            <button
              onClick={() => abmelden()}
              className="text-blue-600 hover:underline"
            >
              Abmelden
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
