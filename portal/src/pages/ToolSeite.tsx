import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";

export default function ToolSeite() {
  const { benutzer } = useAuth();

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-gray-800 mb-1">
        Willkommen, {benutzer?.name}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Wählen Sie ein Tool, für das Sie freigeschaltet sind.
      </p>

      {benutzer && benutzer.tools.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-6 text-gray-500 text-sm">
          Für Ihr Konto ist aktuell kein Tool freigeschaltet. Bitte an die
          Verwaltung wenden.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {benutzer?.tools.map((tool) => (
            <a
              key={tool.slug}
              href={tool.pfad}
              className="bg-white rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow block"
            >
              <h3 className="font-semibold text-gray-800">{tool.name}</h3>
              {tool.beschreibung && (
                <p className="text-sm text-gray-500 mt-1">{tool.beschreibung}</p>
              )}
              <p className="text-xs text-blue-600 mt-3">
                Rolle: {benutzer.zugriff[tool.slug]}
              </p>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}
