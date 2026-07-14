-- Tabelle "AuditLog" -> "audit_log": suiteweit einheitliche Benennung (@@map),
-- konsistent mit Portal und Handkassen. Reine Metadaten-Umbenennung von Tabelle,
-- Primaerschluessel und Indizes – keine Datenbewegung, sofort wirksam.
ALTER TABLE "AuditLog" RENAME TO "audit_log";
ALTER TABLE "audit_log" RENAME CONSTRAINT "AuditLog_pkey" TO "audit_log_pkey";
ALTER INDEX "AuditLog_zeitpunkt_idx" RENAME TO "audit_log_zeitpunkt_idx";
ALTER INDEX "AuditLog_betroffenerMitarbeiterId_idx" RENAME TO "audit_log_betroffenerMitarbeiterId_idx";
