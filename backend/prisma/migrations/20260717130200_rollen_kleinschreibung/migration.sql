-- Rollen suite-weit vereinheitlicht: Kleinschreibung. Bestehende Zugriffe
-- (z. B. Stunden-Rollen wie 'ADMIN') und die Tool-Registry werden angepasst;
-- der Seed schreibt die Registry beim Start ohnehin identisch nach.
UPDATE "zugriff" SET "rolle" = lower("rolle");
UPDATE "tool" SET "rollen" = (
  SELECT COALESCE(jsonb_agg(lower(r)), '[]'::jsonb)
  FROM jsonb_array_elements_text("rollen") AS r
);
