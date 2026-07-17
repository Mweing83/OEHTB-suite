import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import AusschreibungenSeite from "./pages/AusschreibungenSeite";
import LandschaftSeite from "./pages/LandschaftSeite";
import QuelleDetailSeite from "./pages/QuelleDetailSeite";
import PruefenSeite from "./pages/PruefenSeite";
import ScansSeite from "./pages/ScansSeite";
import EinstellungenSeite from "./pages/EinstellungenSeite";

// Keine Sitzung / kein Zugriff -> Hinweis mit Link ins Portal (Muster stunden).
function KeineSitzung() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-gray-800 mb-2">Förderungen ÖHTB</h1>
        <p className="text-sm text-gray-500 mb-6">
          Keine gültige Sitzung oder kein Zugriff auf dieses Tool. Bitte über das
          Portal anmelden.
        </p>
        <a
          href="/"
          className="inline-block bg-marke-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-marke-700"
        >
          Zum Portal
        </a>
      </div>
    </div>
  );
}

function AppRouten() {
  const { benutzer, laedt } = useAuth();

  if (laedt) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Lädt …
      </div>
    );
  }
  if (!benutzer) return <KeineSitzung />;

  return (
    <Routes>
      <Route path="/" element={<AusschreibungenSeite />} />
      <Route path="/landschaft" element={<LandschaftSeite />} />
      <Route path="/landschaft/:id" element={<QuelleDetailSeite />} />
      <Route path="/pruefen" element={<PruefenSeite />} />
      <Route path="/scans" element={<ScansSeite />} />
      <Route path="/einstellungen" element={<EinstellungenSeite />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouten />
    </AuthProvider>
  );
}
