import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "./prisma";
import { provisionDelete, provisionUpsert } from "./provision";
import { stelleZu } from "./provisionWorker";
import { resetDb } from "../test/helfer";

// Integrationstests laufen nur mit ausdruecklich gesetzter Testdatenbank.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// Security-Audit 2026-10: Ein veralteter UPSERT darf einen juengeren
// Entzug/Tombstone nicht ueberholen.
run("Provisionierungs-Outbox: neuester Stand gewinnt (Integration)", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const tool = await prisma.tool.create({
      data: {
        slug: "handkassen",
        name: "Handkassen",
        pfad: "/handkassen/",
        rollen: ["erfasser"],
        provisionUrl: "http://tool.invalid",
      },
    });
    const user = await prisma.suiteUser.create({
      data: { benutzername: "otto", name: "Otto", passwortSetzen: false },
    });
    await prisma.zugriff.create({ data: { userId: user.id, toolId: tool.id, rolle: "erfasser" } });
    userId = user.id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ein neuer Auftrag hakt aeltere, noch offene Auftraege desselben Benutzers ab", async () => {
    await provisionUpsert(userId, "handkassen");
    await provisionDelete(userId, "handkassen", "otto");

    const offen = await prisma.provisionOutbox.findMany({ where: { status: "PENDING" } });
    expect(offen.map((a) => a.op)).toEqual(["DELETE"]);
    const ueberholt = await prisma.provisionOutbox.findFirstOrThrow({ where: { op: "UPSERT" } });
    expect(ueberholt.status).toBe("DONE");
    expect(ueberholt.letzterFehler).toContain("ueberholt");
  });

  it("scheitert ein aelterer Auftrag, wird der juengere desselben Benutzers nicht vorgezogen", async () => {
    // Zwei offene Auftraege (z. B. aus der Zeit vor diesem Fix) direkt anlegen.
    await prisma.provisionOutbox.create({
      data: {
        toolSlug: "handkassen",
        suiteUserId: userId,
        op: "UPSERT",
        payload: { suiteUserId: userId, aktiv: true },
        erstelltAm: new Date(Date.now() - 2000),
      },
    });
    await prisma.provisionOutbox.create({
      data: {
        toolSlug: "handkassen",
        suiteUserId: userId,
        op: "DELETE",
        payload: { suiteUserId: userId, benutzername: "otto" },
        erstelltAm: new Date(Date.now() - 1000),
      },
    });

    const aufrufe: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        aufrufe.push(String(init.method));
        return new Response("{}", { status: 500 });
      })
    );

    await stelleZu();
    expect(aufrufe).toEqual(["PUT"]); // DELETE wartet auf den aelteren Auftrag
    const del = await prisma.provisionOutbox.findFirstOrThrow({ where: { op: "DELETE" } });
    expect(del.status).toBe("PENDING");
    expect(del.versuche).toBe(0);
  });
});
