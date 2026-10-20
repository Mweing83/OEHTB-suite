import { PrismaClient } from "@prisma/client";
import { passwortHashen, passwortPruefen } from "../src/lib/auth.js";

const prisma = new PrismaClient();

// Kontenplan aus dem Lastenheft (VBW & GVB, Leistungsstufe 5–8).
const konten: { nummer: string; bezeichnung: string; beschreibung?: string; anmerkung?: string }[] = [
  { nummer: "54450", bezeichnung: "Beförderungskosten", beschreibung: "Taxi, Fahrscheine" },
  { nummer: "76000", bezeichnung: "Büromaterial & Drucksorten", beschreibung: "Papier, Büromaterial", anmerkung: "Möglichst über ÖHTB Lager" },
  { nummer: "76300", bezeichnung: "Fachliteratur & Zeitungen", anmerkung: "Nach Absprache Leitung" },
  { nummer: "67900", bezeichnung: "Freiwilliger Sozialaufwand", beschreibung: "Kaffee, Milch, Getränke, Abschiedsgeschenke", anmerkung: "Nach Absprache Leitung" },
  { nummer: "70210", bezeichnung: "GWG BGA", beschreibung: "Gegenstände > €50 (Mixer, Wasserkocher, Bettwäsche)", anmerkung: "Unter €50 → Instandhaltung" },
  { nummer: "70220", bezeichnung: "GWG EDV & Technik", beschreibung: "Maus, Tastatur, Verlängerungskabel > €50", anmerkung: "Unter €50 → Büromaterial/Instandhaltung" },
  { nummer: "50720", bezeichnung: "Hygieneaufwand Klienten", beschreibung: "Duschgel, Hygieneartikel" },
  { nummer: "72000", bezeichnung: "Instandhaltung allgemein", beschreibung: "Reparaturen" },
  { nummer: "97000", bezeichnung: "Interne Einzahlungen", beschreibung: "Umbuchungen, Kundenzahlungen, Urlaubsreisen", anmerkung: "Nur Leitung" },
  { nummer: "50710", bezeichnung: "Medikamente & Heilbehelfe Klienten", beschreibung: "Blutdruckmessgerät etc.", anmerkung: "Nach Absprache Leitung" },
  { nummer: "73900", bezeichnung: "Postgebühren", beschreibung: "Briefmarken, Pakete" },
  { nummer: "50360", bezeichnung: "Reinigungsaufwand WGs", beschreibung: "Reinigungsmittel, -material", anmerkung: "Möglichst über ÖHTB Lager" },
  { nummer: "50370", bezeichnung: "Sonstiger Aufwand Klienten", beschreibung: "Geburtstags-/Weihnachtsgeld, Blumen" },
  { nummer: "78400", bezeichnung: "Sonst. betriebl. Aufwendungen", beschreibung: "Nicht zuordenbare Rechnungen, Dekoration" },
  { nummer: "76900", bezeichnung: "Spenden & Trinkgelder", beschreibung: "Trinkgelder, Splitbuchung" },
  { nummer: "67300", bezeichnung: "Supervision Mitarbeiter", beschreibung: "Rechnung an Leitung / Buchhaltung", anmerkung: "An ÖHTB Wohnen GmbH + MA-Name" },
  { nummer: "73800", bezeichnung: "Telefon & Internet", beschreibung: "Zoom-Gebühren", anmerkung: "Nur Leitung" },
  { nummer: "50700", bezeichnung: "Therapie & Freizeitaufwendungen", beschreibung: "Eintritt, Bäder, Kino, Theater", anmerkung: "Trinkgeld → Spenden & Trinkgelder" },
  { nummer: "50250", bezeichnung: "Verpflegung Klienten", beschreibung: "Lebensmittel, Getränke, Restaurants, Liefergebühren", anmerkung: "Trinkgeld → Spenden & Trinkgelder" },
  { nummer: "99900", bezeichnung: "Unklare Buchungsfälle", beschreibung: "Bei Unklarheiten → Leitung" },
  { nummer: "28970", bezeichnung: "Verr. Konto Dotationen Wohnen", beschreibung: "Ein-/Auszahlungen Dotationen" },
  { nummer: "50350", bezeichnung: "Werkzeug- & Geschirrsatz" },
];

// Produktion: bereits frueher angelegte Demo-Konten unschaedlich machen
// (erkannt am Demo-Passwort; Buchungen/Historie bleiben immer erhalten).
// - Unverknuepfte Zeile: Freischaltungen entfernen, deaktivieren, Passwort-
//   Hash loeschen.
// - Mit Suite-Benutzer verknuepfte Zeile (z. B. der Suite-Admin): nur den
//   lokalen Passwort-Hash loeschen (Login laeuft ohnehin ueber die Suite);
//   hat sie noch Kostenstellen-Freischaltungen, wird gewarnt – ob die gewollt
//   sind, entscheidet die Verwaltung.
const DEMO_KONTEN: Record<string, string> = {
  admin: "admin123",
  leitung: "leitung123",
  erfasser: "erfass123",
};

async function demoKontenEntschaerfen(): Promise<void> {
  for (const [benutzername, demoPasswort] of Object.entries(DEMO_KONTEN)) {
    const b = await prisma.benutzer.findUnique({ where: { benutzername } });
    if (!b?.passwortHash) continue;
    if (!(await passwortPruefen(demoPasswort, b.passwortHash))) continue;
    if (b.suiteUserId) {
      await prisma.benutzer.update({ where: { id: b.id }, data: { passwortHash: null } });
      const freischaltungen = await prisma.benutzerKostenstelle.count({ where: { benutzerId: b.id } });
      console.log(`Demo-Passwort des verknuepften Kontos '${benutzername}' entfernt.`);
      if (freischaltungen > 0) {
        console.warn(
          `WARNUNG: '${benutzername}' ist mit einem Suite-Benutzer verknuepft und hat noch ${freischaltungen} ` +
            "Kostenstellen-Freischaltung(en) aus den Demo-Daten. Bitte in der Handkassen-Administration pruefen " +
            "und den Suite-Benutzer in der Verwaltung ggf. deaktivieren."
        );
      }
      continue;
    }
    const entfernt = await prisma.benutzerKostenstelle.deleteMany({ where: { benutzerId: b.id } });
    await prisma.benutzer.update({
      where: { id: b.id },
      data: { aktiv: false, passwortHash: null },
    });
    console.warn(
      `Demo-Konto '${benutzername}' entschaerft: deaktiviert, Passwort entfernt, ${entfernt.count} Freischaltung(en) geloescht.`
    );
  }
}

async function main() {
  // Konten
  for (const k of konten) {
    await prisma.konto.upsert({
      where: { nummer: k.nummer },
      update: {},
      create: k,
    });
  }
  console.log(`${konten.length} Konten angelegt/aktualisiert.`);

  // Standard-Steuersätze (durch Admin später anpassbar)
  const steuersaetze = [
    { prozent: 0, bezeichnung: "0 % (steuerfrei / ausländisch / handschriftlich)" },
    { prozent: 10, bezeichnung: "ermäßigter Satz 10 %" },
    { prozent: 20, bezeichnung: "Normalsatz 20 %" },
  ];
  for (const s of steuersaetze) {
    await prisma.steuersatz.upsert({
      where: { prozent: s.prozent },
      update: {},
      create: s,
    });
  }
  console.log(`${steuersaetze.length} Steuersätze angelegt/aktualisiert.`);

  // Standard-Bereiche (durch Admin später anpassbar)
  const bereiche = ["VBW", "GVB", "TBW"];
  for (const bezeichnung of bereiche) {
    await prisma.bereich.upsert({ where: { bezeichnung }, update: {}, create: { bezeichnung } });
  }
  console.log(`${bereiche.length} Bereiche angelegt/aktualisiert.`);

  // Demo-Freigaben: die meisten Konten fuer alle Bereiche, mindestens eines
  // bewusst nur fuer einen Bereich, damit der n:m-Fall abgedeckt ist.
  const alleBereiche = await prisma.bereich.findMany({ select: { id: true, bezeichnung: true } });
  const alleKonten = await prisma.konto.findMany({ select: { id: true, nummer: true } });
  for (const k of alleKonten) {
    const zielBereiche =
      k.nummer === "28970"
        ? alleBereiche.filter((b) => b.bezeichnung === "VBW") // Beispiel: nur VBW
        : alleBereiche;
    for (const b of zielBereiche) {
      await prisma.bereichKonto.upsert({
        where: { bereichId_kontoId: { bereichId: b.id, kontoId: k.id } },
        update: {},
        create: { bereichId: b.id, kontoId: k.id },
      });
    }
  }
  console.log(`Demo-Konto-Freigaben gesetzt.`);

  // Standard-Kassenarten (durch Admin später anpassbar)
  const kassenarten = ["einrichtung", "klientenkasse"];
  for (const bezeichnung of kassenarten) {
    await prisma.kassenart.upsert({ where: { bezeichnung }, update: {}, create: { bezeichnung } });
  }
  console.log(`${kassenarten.length} Kassenarten angelegt/aktualisiert.`);

  // Demo-Daten (fiktive Kostenstellen 1260/1370, Benutzer admin/leitung/
  // erfasser mit im Repository stehenden Passwoertern und Freischaltungen)
  // NUR ausserhalb der Produktion. Das Dockerfile fuehrt diesen Seed bei jedem
  // Produktionsstart aus – frueher landeten die Demo-Konten so im Echtbetrieb
  // (Security-Audit 2026-10).
  if (process.env.NODE_ENV !== "production") {
    // Demo-Kostenstellen (fiktiv) – Bereich/Kassenart per Bezeichnung verknüpfen
    const ks1 = await prisma.kostenstelle.upsert({
      where: { id: 1 },
      update: {},
      create: {
        nummer: "1260",
        gegenkonto: "99957",
        bezeichnung: "WG Beispielstraße 1",
        bereich: { connect: { bezeichnung: "VBW" } },
        kassenart: { connect: { bezeichnung: "einrichtung" } },
      },
    });
    const ks2 = await prisma.kostenstelle.upsert({
      where: { id: 2 },
      update: {},
      create: {
        nummer: "1370",
        gegenkonto: "99957",
        bezeichnung: "Stützpunkt Musterplatz",
        bereich: { connect: { bezeichnung: "GVB" } },
        kassenart: { connect: { bezeichnung: "einrichtung" } },
      },
    });

    // Demo-Benutzer (NUR für Entwicklung – vor Produktivbetrieb entfernen!)
    // passwortSetzen=false, damit der Login mit dem Demo-Passwort sofort klappt.
    const admin = await prisma.benutzer.upsert({
      where: { benutzername: "admin" },
      update: {},
      create: { benutzername: "admin", name: "Administrator", rolle: "admin", passwortSetzen: false, passwortHash: await passwortHashen("admin123") },
    });
    const leitung = await prisma.benutzer.upsert({
      where: { benutzername: "leitung" },
      update: {},
      create: { benutzername: "leitung", name: "Demo Leitung", rolle: "leitung", passwortSetzen: false, passwortHash: await passwortHashen("leitung123") },
    });
    const erfasser = await prisma.benutzer.upsert({
      where: { benutzername: "erfasser" },
      update: {},
      create: { benutzername: "erfasser", name: "Demo Erfasser", rolle: "erfasser", passwortSetzen: false, passwortHash: await passwortHashen("erfass123") },
    });

    // Erfasser für beide Demo-Kostenstellen freischalten (Anf. P-02)
    for (const ks of [ks1, ks2]) {
      await prisma.benutzerKostenstelle.upsert({
        where: { benutzerId_kostenstelleId: { benutzerId: erfasser.id, kostenstelleId: ks.id } },
        update: {},
        create: { benutzerId: erfasser.id, kostenstelleId: ks.id },
      });
      await prisma.benutzerKostenstelle.upsert({
        where: { benutzerId_kostenstelleId: { benutzerId: leitung.id, kostenstelleId: ks.id } },
        update: {},
        create: { benutzerId: leitung.id, kostenstelleId: ks.id },
      });
    }

    console.log("Demo-Benutzer und Kostenstellen angelegt.");
    console.log("  admin / admin123, leitung / leitung123, erfasser / erfass123");
  } else {
    await demoKontenEntschaerfen();
  }

  // Backup-Konfiguration sicherstellen (genau eine Zeile mit Standardwerten)
  const backupVorhanden = await prisma.backupKonfig.findFirst();
  if (!backupVorhanden) {
    await prisma.backupKonfig.create({ data: {} });
    console.log("Backup-Konfiguration angelegt (Standardwerte).");
  }

  // Allgemein-Konfiguration sicherstellen (genau eine Zeile, Standard-Sperrfrist)
  const allgemeinVorhanden = await prisma.allgemeinKonfig.findFirst();
  if (!allgemeinVorhanden) {
    await prisma.allgemeinKonfig.create({ data: {} });
    console.log("Allgemein-Konfiguration angelegt (Sperrfrist 5 Tage).");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
