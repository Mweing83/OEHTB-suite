# Mehrstufiger Build: Frontend (SPA) + Backend (API) in EINEM Image.
# Das Backend liefert im Produktivbetrieb die gebaute Oberflaeche und die API
# auf demselben Port aus (Single-Origin). Der Suite-Reverse-Proxy legt den
# Pfad-Praefix "/foerderungen/" davor. Muster: handkassen/backend/Dockerfile.
#
# Build-Kontext = Projekt-Stammverzeichnis "foerderungen" (docker-compose der Suite:
# build.context = ../foerderungen, dockerfile = backend/Dockerfile).
#
# Basis node:20-slim (Debian, nicht alpine): Prisma erkennt dort OpenSSL 3
# zuverlaessig (auf alpine sonst "failed to detect libssl").

# ---- Stufe 1: Frontend bauen (mit Pfad-Praefix /foerderungen/) ----
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_BASE=/foerderungen/
RUN npm run build
# Ergebnis: /fe/dist (statische SPA, Assets unter /foerderungen/)

# ---- Stufe 2: Backend bauen (TypeScript -> dist) ----
FROM node:20-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---- Stufe 3: Laufzeit-Image ----
FROM node:20-slim AS runtime
# Nur die im Lockfile festgelegten Versionen installieren (npm ci), im
# Laufzeit-Image ohne Entwicklungspakete; die App laeuft nicht als root
# (Haertung nach Security-Audit 2026-10).
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY --from=backend /app/dist ./dist
# Gebautes Frontend fuer die statische Auslieferung (STATIC_DIR).
COPY --from=frontend /fe/dist ./static

EXPOSE 3003
USER node
# Migrationen beim Start anwenden, danach den Seed (Initialkatalog; idempotent),
# dann Server starten.
# - Migration mit Backoff (bis 6 Versuche, 10s Pause): faengt kurze DB-Aussetzer
#   ab, statt in eine enge Crash-Loop zu laufen.
# - "exec node": node wird PID 1, damit Dockers SIGTERM den Prozess erreicht
#   (sauberes Herunterfahren).
CMD ["sh", "-c", "n=0; until npx prisma migrate deploy; do n=$((n+1)); if [ $n -ge 6 ]; then echo 'Migration nach 6 Versuchen fehlgeschlagen - Abbruch'; exit 1; fi; echo \"Migration fehlgeschlagen (Versuch $n/6) - erneuter Versuch in 10s...\"; sleep 10; done && npx tsx prisma/seed.ts && exec node dist/index.js"]
