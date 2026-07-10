import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { provisionSecret, ProvisionUserPayload } from "../lib/provision";

// ---------------------------------------------------------------------------
// Portal-seitiger Provisionierungs-Endpunkt (Tool -> Suite).
//
// GET /api/suite/provision/snapshot?tool=<slug>
//   Liefert die vollstaendige SOLL-Benutzerliste eines Tools. Tools rufen dies
//   beim Start ab und gleichen ihren lokalen Spiegel ab (Self-Heal nach
//   Ausfall/DB-Reset). Nur mit gemeinsamem Geheimnis (X-Provision-Secret).
// ---------------------------------------------------------------------------

export const provisionRouter = Router();

function secretOk(req: Request): boolean {
  return req.header("X-Provision-Secret") === provisionSecret();
}

provisionRouter.get("/snapshot", async (req: Request, res: Response) => {
  if (!secretOk(req)) {
    res.status(401).json({ fehler: "Nicht autorisiert." });
    return;
  }
  const slug = String(req.query.tool ?? "");
  const tool = await prisma.tool.findUnique({ where: { slug } });
  if (!tool) {
    res.status(404).json({ fehler: "Unbekanntes Tool." });
    return;
  }

  const zugriffe = await prisma.zugriff.findMany({
    where: { toolId: tool.id },
    include: { user: true },
  });

  const users: ProvisionUserPayload[] = zugriffe.map((z) => ({
    suiteUserId: z.user.id,
    benutzername: z.user.benutzername,
    name: z.user.name,
    email: z.user.email,
    aktiv: z.user.aktiv,
    rolle: z.rolle,
  }));

  res.json({ tool: slug, users });
});
