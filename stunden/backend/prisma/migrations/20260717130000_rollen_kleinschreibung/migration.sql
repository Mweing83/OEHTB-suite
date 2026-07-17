-- Rollen suite-weit vereinheitlicht: Kleinschreibung (wie Handkassen und
-- Portal-Registry). RENAME VALUE benennt auch alle gespeicherten Werte um.
ALTER TYPE "Rolle" RENAME VALUE 'ADMIN' TO 'admin';
ALTER TYPE "Rolle" RENAME VALUE 'SACHBEARBEITER' TO 'sachbearbeiter';
ALTER TYPE "Rolle" RENAME VALUE 'PERSONALVERRECHNUNG' TO 'personalverrechnung';
ALTER TYPE "Rolle" RENAME VALUE 'LESER' TO 'leser';
