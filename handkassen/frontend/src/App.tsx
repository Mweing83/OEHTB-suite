import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.js";
import BuchungenSeite from "./pages/BuchungenSeite.js";
import AbschlussSeite from "./pages/AbschlussSeite.js";
import BerichteSeite from "./pages/BerichteSeite.js";
import AdminSeite from "./pages/AdminSeite.js";
import KontaktSeite from "./pages/KontaktSeite.js";

// Login/Passwort liegen seit der Suite-Integration zentral im Portal. Dieses
// Tool zeigt kein eigenes Login und keinen Passwort-Dialog mehr.

function Layout({ children }: { children: React.ReactNode }) {
  const { benutzer, abmelden, inaktivWarnung, aktivitaetMelden } = useAuth();
  const ort = useLocation();
  if (!benutzer) return <>{children}</>;

  const navLink = (pfad: string, text: string) => (
    <Link
      to={pfad}
      aria-current={ort.pathname === pfad ? "page" : undefined}
      className={`px-3 py-2 rounded-md text-sm font-medium ${
        ort.pathname === pfad
          ? "bg-marke-700 text-white"
          : "text-marke-100 hover:bg-marke-800"
      }`}
    >
      {text}
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-marke-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">ÖHTB</span>
            <span className="text-marke-300" aria-hidden="true">
              ·
            </span>
            <span className="text-base font-medium text-marke-100">
              Handkassen
            </span>
          </div>
          <nav className="flex items-center gap-1 flex-wrap">
            <a
              href="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-marke-100 hover:bg-marke-800"
            >
              ← Portal
            </a>
            {navLink("/buchungen", "Buchungen")}
            {navLink("/abschluss", "Abschlüsse")}
            {navLink("/berichte", "Berichte")}
            {benutzer.rolle === "admin" && navLink("/admin", "Verwaltung")}
            {navLink("/kontakt", "Kontakt")}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-marke-200">
              {benutzer.name}{" "}
              <span className="text-marke-300">({benutzer.rolle})</span>
            </span>
            <button
              onClick={abmelden}
              className="rounded-md bg-marke-800 px-3 py-1.5 font-medium hover:bg-marke-700"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>

      {inaktivWarnung && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm mx-4">
            <h3 className="font-semibold text-marke-900 mb-2">
              Sitzung läuft bald ab
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Sie werden wegen Inaktivität in etwa einer Minute automatisch abgemeldet.
              Möchten Sie angemeldet bleiben?
            </p>
            <div className="flex gap-2">
              <button
                onClick={aktivitaetMelden}
                className="flex-1 bg-marke-600 text-white rounded-md py-2 text-sm font-medium hover:bg-marke-700"
              >
                Angemeldet bleiben
              </button>
              <button
                onClick={abmelden}
                className="border border-slate-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Keine Sitzung / kein Zugriff auf dieses Tool -> Hinweis mit Link ins Portal.
function KeineSitzung() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-marke-900 mb-2">
          ÖHTB Handkassen
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Keine gültige Sitzung oder kein Zugriff auf dieses Tool. Bitte über das
          Portal anmelden.
        </p>
        <a
          href="/"
          className="inline-block bg-marke-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-marke-700"
        >
          Zum Portal
        </a>
      </div>
    </div>
  );
}

function Geschuetzt({ children, nurAdmin = false }: { children: React.ReactNode; nurAdmin?: boolean }) {
  const { benutzer, laden } = useAuth();
  if (laden) return <div className="p-8 text-slate-500">Lädt…</div>;
  if (!benutzer) return <KeineSitzung />;
  if (nurAdmin && benutzer.rolle !== "admin") return <Navigate to="/buchungen" replace />;
  return <>{children}</>;
}

function Inhalt() {
  return (
    <Layout>
      <Routes>
        <Route path="/buchungen" element={<Geschuetzt><BuchungenSeite /></Geschuetzt>} />
        <Route path="/abschluss" element={<Geschuetzt><AbschlussSeite /></Geschuetzt>} />
        <Route path="/berichte" element={<Geschuetzt><BerichteSeite /></Geschuetzt>} />
        <Route path="/kontakt" element={<Geschuetzt><KontaktSeite /></Geschuetzt>} />
        <Route path="/admin" element={<Geschuetzt nurAdmin><AdminSeite /></Geschuetzt>} />
        <Route path="*" element={<Navigate to="/buchungen" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Inhalt />
    </AuthProvider>
  );
}
