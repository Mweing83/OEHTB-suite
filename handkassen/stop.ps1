# ============================================================
#  ÖHTB Handkassen – Stoppskript
#  Beendet die Anwendung. Datenbank und Backup-Dienst laufen
#  BEWUSST im Hintergrund weiter, damit die automatische
#  naechtliche Sicherung funktioniert. Backend-/Frontend-Fenster
#  werden manuell geschlossen.
# ============================================================

Set-Location -Path $PSScriptRoot

Write-Host "============================================" -ForegroundColor White
Write-Host "  OEHTB Handkassen - Stop" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ---------- 1. App beenden, Hintergrunddienste weiterlaufen lassen ----------
Write-Host ""
Write-Host "==> Beende die Anwendung..." -ForegroundColor Cyan
Write-Host "Datenbank und Backup-Dienst laufen im Hintergrund WEITER," -ForegroundColor Green
Write-Host "damit die automatische naechtliche Sicherung funktioniert." -ForegroundColor Green
Write-Host "(Die Datenbank bleibt an, weil der Backup-Dienst sie zum Sichern braucht.)" -ForegroundColor Gray

# ---------- 2. Hinweis zu den Fenstern ----------
Write-Host ""
Write-Host "Bitte die Fenster 'BACKEND' und 'FRONTEND' schliessen," -ForegroundColor Yellow
Write-Host "falls sie noch offen sind (oder dort jeweils Strg+C druecken)." -ForegroundColor Yellow

# ---------- 3. Hinweis: alles vollstaendig beenden ----------
Write-Host ""
Write-Host "Hinweis: Wenn du wirklich ALLES beenden willst (auch Datenbank + Backup-Dienst)," -ForegroundColor Gray
Write-Host "z. B. vor dem Herunterfahren, fuehre in diesem Ordner aus:" -ForegroundColor Gray
Write-Host "  docker compose --profile produktion down" -ForegroundColor Gray
Write-Host ""
Write-Host "Fertig. Du kannst dieses Fenster schliessen."
Start-Sleep -Seconds 4
