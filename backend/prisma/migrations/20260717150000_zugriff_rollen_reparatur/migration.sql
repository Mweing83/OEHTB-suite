-- Repariert Zugriffe, deren Rolle es im jeweiligen Tool gar nicht gibt.
-- Der fruehere Seed vergab bei jedem Start pauschal 'admin' - auch fuer
-- Foerderungen, dessen einzige Rolle 'nutzer' ist. Solche ungueltigen
-- Zuordnungen werden auf die erste gueltige Tool-Rolle gesetzt.
UPDATE "zugriff" z
SET "rolle" = t."rollen"->>0
FROM "tool" t
WHERE t."id" = z."toolId"
  AND NOT t."rollen" ? z."rolle";
