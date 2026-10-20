import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Initialkatalog der oesterreichischen Foerderlandschaft fuer das OEHTB.
// Idempotent: Abgleich ueber den Namen; bestehende Zeilen werden NICHT
// ueberschrieben (Redaktion im Werkzeug hat Vorrang vor dem Seed).

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Eintrag = {
  name: string;
  traeger: string;
  ebene: "BUND" | "LAND" | "GEMEINDE" | "EU" | "PRIVAT";
  kategorie: "PROJEKT" | "KERNGESCHAEFT" | "BEIDES";
  themen: string[];
  beschreibung: string;
  webseite: string;
};

const KATALOG: Eintrag[] = [
  {
    name: "Fonds Soziales Wien (FSW)",
    traeger: "Stadt Wien",
    ebene: "LAND",
    kategorie: "KERNGESCHAEFT",
    themen: ["Behindertenhilfe", "Wohnen", "Tagesstruktur"],
    beschreibung:
      "Zentraler Kostentraeger der Wiener Behindertenhilfe: Leistungsfinanzierung fuer Wohnen, Tagesstruktur und Beratung anerkannter Traeger.",
    webseite: "https://www.fsw.at",
  },
  {
    name: "Sozialministeriumservice – NEBA / Ausgleichstaxfonds",
    traeger: "Bund (BMSGPK)",
    ebene: "BUND",
    kategorie: "BEIDES",
    themen: ["Behindertenhilfe", "Arbeitsmarkt", "Inklusion"],
    beschreibung:
      "Foerderungen zur beruflichen Teilhabe von Menschen mit Behinderung (NEBA-Leistungen, Zuschuesse, Projektfoerderungen aus dem Ausgleichstaxfonds).",
    webseite: "https://www.sozialministeriumservice.at",
  },
  {
    name: "Bundesministerium fuer Soziales (BMSGPK) – Projektfoerderungen",
    traeger: "Bund (BMSGPK)",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Behindertenhilfe", "Inklusion", "Soziales"],
    beschreibung:
      "Projektfoerderungen des Sozialministeriums, u. a. aus Mitteln des Unterstuetzungsfonds fuer Menschen mit Behinderung.",
    webseite: "https://www.sozialministerium.at",
  },
  {
    name: "ESF+ Oesterreich",
    traeger: "EU / BMAW-BMSGPK (Verwaltungsbehoerde)",
    ebene: "EU",
    kategorie: "PROJEKT",
    themen: ["Inklusion", "Arbeitsmarkt", "Armutsbekaempfung"],
    beschreibung:
      "Europaeischer Sozialfonds Plus: Calls fuer Projekte zu Beschaeftigung, Inklusion und sozialer Innovation in Oesterreich.",
    webseite: "https://www.esf.at",
  },
  {
    name: "Erasmus+ (OeAD)",
    traeger: "EU / OeAD",
    ebene: "EU",
    kategorie: "PROJEKT",
    themen: ["Bildung", "Inklusion", "Austausch"],
    beschreibung:
      "EU-Programm fuer Bildung und Jugend; Foerderschiene fuer inklusive Projekte und strategische Partnerschaften.",
    webseite: "https://erasmusplus.at",
  },
  {
    name: "EU4Health",
    traeger: "EU (HaDEA)",
    ebene: "EU",
    kategorie: "PROJEKT",
    themen: ["Gesundheit"],
    beschreibung:
      "EU-Gesundheitsprogramm mit Calls u. a. zu Versorgung, Praevention und vulnerablen Gruppen.",
    webseite: "https://hadea.ec.europa.eu",
  },
  {
    name: "FFG – Oesterreichische Forschungsfoerderungsgesellschaft",
    traeger: "Bund",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Digitalisierung", "Assistenztechnologie", "Innovation"],
    beschreibung:
      "Foerdert F&E- und Digitalisierungsprojekte (z. B. benefit/AAL-Nachfolgeprogramme, Digitalisierungs-Calls) – relevant fuer Assistenztechnologie.",
    webseite: "https://www.ffg.at",
  },
  {
    name: "aws – Austria Wirtschaftsservice",
    traeger: "Bund",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Digitalisierung", "Investitionen"],
    beschreibung:
      "Foerderbank des Bundes: Zuschuesse/Garantien fuer Investitions- und Digitalisierungsprojekte, teils auch fuer gemeinnuetzige Organisationen.",
    webseite: "https://www.aws.at",
  },
  {
    name: "Fonds Gesundes Oesterreich (FGOe)",
    traeger: "Bund (Gesundheit Oesterreich GmbH)",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Gesundheitsfoerderung", "Praevention"],
    beschreibung:
      "Projektfoerderungen der Gesundheitsfoerderung, auch fuer Zielgruppen mit Behinderung.",
    webseite: "https://fgoe.org",
  },
  {
    name: "OeNB Jubilaeumsfonds",
    traeger: "Oesterreichische Nationalbank",
    ebene: "BUND",
    kategorie: "PROJEKT",
    themen: ["Forschung"],
    beschreibung:
      "Foerdert wissenschaftliche Projekte, u. a. sozial- und gesundheitswissenschaftliche Begleitforschung.",
    webseite: "https://www.oenb.at",
  },
  {
    name: "Stadt Wien – MA 40 Soziales",
    traeger: "Stadt Wien",
    ebene: "GEMEINDE",
    kategorie: "BEIDES",
    themen: ["Soziales", "Behindertenhilfe"],
    beschreibung:
      "Foerderungen und Subventionen der Stadt Wien im Sozialbereich ausserhalb der FSW-Leistungsfinanzierung.",
    webseite: "https://www.wien.gv.at/gesundheit-soziales",
  },
  {
    name: "Land Niederoesterreich – Soziales",
    traeger: "Land Niederoesterreich",
    ebene: "LAND",
    kategorie: "BEIDES",
    themen: ["Behindertenhilfe", "Soziales"],
    beschreibung:
      "Foerderungen des Landes NOe fuer Behindertenhilfe und soziale Dienste (relevant fuer Standorte/Angebote ausserhalb Wiens).",
    webseite: "https://www.noe.gv.at",
  },
  {
    name: "Licht ins Dunkel",
    traeger: "Verein Licht ins Dunkel / ORF",
    ebene: "PRIVAT",
    kategorie: "PROJEKT",
    themen: ["Behindertenhilfe", "Soforthilfe", "Projekte"],
    beschreibung:
      "Oesterreichs groesste Spendenaktion; finanziert Projekte von Sozialorganisationen, Schwerpunkt Menschen mit Behinderung.",
    webseite: "https://lichtinsdunkel.org",
  },
  {
    name: "ERSTE Stiftung",
    traeger: "DIE ERSTE oesterreichische Spar-Casse Privatstiftung",
    ebene: "PRIVAT",
    kategorie: "PROJEKT",
    themen: ["Soziales", "Inklusion", "Zivilgesellschaft"],
    beschreibung:
      "Privatstiftung mit Programmen und Ausschreibungen im Sozialbereich (z. B. Auszeichnungen und Projektfoerderungen).",
    webseite: "https://www.erstestiftung.org",
  },
  {
    name: "Essl Foundation",
    traeger: "Essl Foundation",
    ebene: "PRIVAT",
    kategorie: "PROJEKT",
    themen: ["Behindertenhilfe", "Inklusion", "Innovation"],
    beschreibung:
      "Stiftung mit Fokus auf Menschen mit Behinderung (Zero Project); foerdert und praemiert inklusive Projekte.",
    webseite: "https://www.esslfoundation.org",
  },
];

async function main() {
  let neu = 0;
  for (const e of KATALOG) {
    const vorhanden = await prisma.foerderquelle.findFirst({ where: { name: e.name } });
    if (vorhanden) continue;
    await prisma.foerderquelle.create({ data: { ...e, status: "AKTIV", quelleTyp: "MANUELL" } });
    neu++;
  }
  console.log(`Seed: ${neu} von ${KATALOG.length} Foerderquellen neu angelegt.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
