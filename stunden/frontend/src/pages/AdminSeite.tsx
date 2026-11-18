import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";
import LlmEinstellungen from "./admin/LlmEinstellungen";
import OllamaInstallation from "./admin/OllamaInstallation";
import VollzeitEinstellungen from "./admin/VollzeitEinstellungen";
import WorkflowEinstellungen from "./admin/WorkflowEinstellungen";
import AuditAnsicht from "./admin/AuditAnsicht";
import ImapEinstellungen from "./admin/ImapEinstellungen";
import ErlaubteAbsender from "./admin/ErlaubteAbsender";

// Administration: je Abschnitt eine Datei unter pages/admin/.
export default function AdminSeite() {
  const { benutzer } = useAuth();

  if (benutzer?.rolle !== "admin") {
    return (
      <Layout>
        <p className="text-gray-600">
          Dieser Bereich ist nur für Administratoren zugänglich.
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Administration</h2>
      <div className="space-y-6">
        <LlmEinstellungen />
        <OllamaInstallation />
        <VollzeitEinstellungen />
        <WorkflowEinstellungen />
        <ImapEinstellungen />
        <ErlaubteAbsender />
        <AuditAnsicht />
      </div>
    </Layout>
  );
}
