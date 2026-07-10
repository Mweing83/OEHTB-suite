import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import LoginSeite from "./pages/LoginSeite";
import ToolSeite from "./pages/ToolSeite";
import VerwaltungSeite from "./pages/VerwaltungSeite";

export default function App() {
  const { benutzer, laedt } = useAuth();

  if (laedt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Lädt …</p>
      </div>
    );
  }

  if (!benutzer) {
    return <LoginSeite />;
  }

  return (
    <Routes>
      <Route path="/" element={<ToolSeite />} />
      <Route path="/verwaltung" element={<VerwaltungSeite />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
