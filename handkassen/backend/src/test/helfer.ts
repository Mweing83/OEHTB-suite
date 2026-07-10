import request from "supertest";
import { prisma } from "../lib/db.js";
import { passwortHashen } from "../lib/auth.js";
import { app } from "../server.js";

// supertest-Agent-Typ ohne fragilen Tiefenimport ableiten.
export type Agent = ReturnType<typeof request.agent>;

// Einheitliches Testpasswort für alle erzeugten Konten.
export const TEST_PW = "passwort123";

// Leert alle Tabellen und setzt die Auto-IDs zurück. CASCADE löst die
// Fremdschlüssel-Abhängigkeiten in der richtigen Reihenfolge auf.
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_log, buchungsposition, buchung, beleg, abschluss,
      benutzer_kostenstelle, monats_sperre, kostenstelle,
      bereich, kassenart, konto, steuersatz, benutzer,
      backup_konfig, allgemein_konfig
    RESTART IDENTITY CASCADE;
  `);
}

export interface Basis {
  ksA: number; // Kostenstelle, auf die der Erfasser Zugriff hat
  ksB: number; // Kostenstelle OHNE Erfasser-Zugriff
  kontoId: number;
  benutzer: {
    admin: number;
    finanzen: number;
    leitungA: number;
    erfasserA: number; // nur ksA freigeschaltet
    erstlogin: number; // hat noch kein Passwort gesetzt
  };
}

// Legt einen minimalen, aber vollständigen Stammdatensatz an: zwei Kostenstellen,
// ein Konto, die Steuersätze 0/10/20 sowie Benutzer je Rolle. Der Erfasser ist
// ausschließlich für ksA freigeschaltet (für die Zugriffstests).
export async function seedBasis(): Promise<Basis> {
  const hash = await passwortHashen(TEST_PW);

  const bereich = await prisma.bereich.create({ data: { bezeichnung: "Testbereich" } });
  const kassenart = await prisma.kassenart.create({ data: { bezeichnung: "Testkasse" } });

  const ksA = await prisma.kostenstelle.create({
    data: { nummer: "1000", bezeichnung: "KS A", bereichId: bereich.id, kassenartId: kassenart.id },
  });
  const ksB = await prisma.kostenstelle.create({
    data: { nummer: "2000", bezeichnung: "KS B", bereichId: bereich.id, kassenartId: kassenart.id },
  });

  const konto = await prisma.konto.create({ data: { nummer: "50000", bezeichnung: "Testkonto" } });

  await prisma.steuersatz.createMany({
    data: [
      { prozent: 0, bezeichnung: "0 %" },
      { prozent: 10, bezeichnung: "10 %" },
      { prozent: 20, bezeichnung: "20 %" },
    ],
  });

  const mk = (benutzername: string, name: string, rolle: any, mitPw = true) =>
    prisma.benutzer.create({
      data: {
        benutzername,
        name,
        rolle,
        passwortHash: mitPw ? hash : null,
        passwortSetzen: !mitPw,
      },
    });

  const admin = await mk("admin", "Admin", "admin");
  const finanzen = await mk("finanzen", "Finanzen", "finanzen");
  const leitungA = await mk("leitung", "Leitung A", "leitung");
  const erfasserA = await mk("erfasser", "Erfasser A", "erfasser");
  const erstlogin = await mk("neu", "Neuer Nutzer", "erfasser", false);

  // Freischaltungen je Kostenstelle (admin/finanzen sehen alles ohne Eintrag).
  await prisma.benutzerKostenstelle.createMany({
    data: [
      { benutzerId: erfasserA.id, kostenstelleId: ksA.id },
      { benutzerId: leitungA.id, kostenstelleId: ksA.id },
    ],
  });

  // Mai 2026 explizit ENTsperren (gesperrt=false hat Vorrang vor der Frist-Regel).
  // Dadurch sind Buchungen mit Belegdatum 2026-05-* unabhängig von der echten
  // Systemuhr testbar (sonst würde der Monat als längst abgelaufen gesperrt sein).
  await prisma.monatsSperre.createMany({
    data: [
      { kostenstelleId: ksA.id, jahr: 2026, monat: 5, gesperrt: false },
      { kostenstelleId: ksB.id, jahr: 2026, monat: 5, gesperrt: false },
    ],
  });

  return {
    ksA: ksA.id,
    ksB: ksB.id,
    kontoId: konto.id,
    benutzer: {
      admin: admin.id,
      finanzen: finanzen.id,
      leitungA: leitungA.id,
      erfasserA: erfasserA.id,
      erstlogin: erstlogin.id,
    },
  };
}

// Meldet einen Benutzer an und liefert einen supertest-Agent, der das
// Session-Cookie über Folge-Anfragen hinweg behält (inkl. der gleitenden
// Token-Erneuerung).
export async function alsAgent(benutzername: string, passwort = TEST_PW): Promise<Agent> {
  const agent = request.agent(app);
  const r = await agent.post("/api/auth/login").send({ benutzername, passwort });
  if (r.status !== 200) {
    throw new Error(`Login fehlgeschlagen (${benutzername}): ${r.status} ${JSON.stringify(r.body)}`);
  }
  return agent;
}

// Standard-Buchungseingabe (Ausgang 10,00 € mit einer Position 20 %).
export function buchungEingabe(kostenstelleId: number, kontoId: number, overrides: Record<string, any> = {}) {
  return {
    betragCent: 1000,
    belegdatum: "2026-05-15",
    typ: "ausgang",
    kostenstelleId,
    positionen: [{ betragCent: 1000, steuersatz: 20, kontoId }],
    ...overrides,
  };
}
