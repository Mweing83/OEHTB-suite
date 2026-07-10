import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import DashboardSeite from "./pages/DashboardSeite";
import MitarbeiterSeite from "./pages/MitarbeiterSeite";
import MitarbeiterDetailSeite from "./pages/MitarbeiterDetailSeite";
import AnfragenSeite from "./pages/AnfragenSeite";
import AdminSeite from "./pages/AdminSeite";

// Keine Sitzung / kein Zugriff auf dieses Tool -> Hinweis mit Link ins Portal.
// (Anmeldung erfolgt zentral in der Suite; ein eigenes Login gibt es hier nicht.)
function KeineSitzung() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-gray-800 mb-2">
          Stunden-Tool ÖHTB
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Keine gültige Sitzung oder kein Zugriff auf dieses Tool. Bitte über das
          Portal anmelden.
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700"
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
      <Route path="/" element={<DashboardSeite />} />
      <Route path="/anfragen" element={<AnfragenSeite />} />
      <Route path="/mitarbeiter" element={<MitarbeiterSeite />} />
      <Route path="/mitarbeiter/:id" element={<MitarbeiterDetailSeite />} />
      <Route path="/admin" element={<AdminSeite />} />
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
