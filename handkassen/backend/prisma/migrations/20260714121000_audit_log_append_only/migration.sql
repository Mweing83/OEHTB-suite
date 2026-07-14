-- audit_log ist revisionssicher (siehe CLAUDE.md, Revisionssicherheit): einzelne
-- Eintraege duerfen nur ANGEHAENGT, niemals veraendert oder geloescht werden.
-- UPDATE und DELETE werden auf Datenbank-Ebene verweigert – Schutz per DB-Regel,
-- nicht nur per Konvention.
CREATE OR REPLACE FUNCTION audit_log_nur_anhaengen()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log ist append-only: % ist nicht erlaubt.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_kein_update_delete ON audit_log;
CREATE TRIGGER audit_log_kein_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_nur_anhaengen();
