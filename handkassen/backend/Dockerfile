# Mehrstufiger Build: Frontend (SPA) + Backend (API) in EINEM Image.
# Das Backend liefert im Produktivbetrieb die gebaute Oberflaeche und die API
# auf demselben Port aus (Single-Origin). Tailscale/Reverse-Proxy legt HTTPS davor.
#
# WICHTIG: Der Build-Kontext ist das Projekt-Stammverzeichnis (siehe
# docker-compose.yml: build.context = ".", dockerfile = "backend/Dockerfile").
#
# Basis: node:20-slim (Debian). Bewusst NICHT alpine, weil Prisma dort die
# OpenSSL-3-Version nicht zuverlaessig erkennt ("failed to detect libssl" ->
# Schema-Engine-Absturz). Debian + installiertes openssl funktioniert stabil.

# ---- Stufe 1: Frontend bauen (mit Pfad-Praefix /handkassen/) ----
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ENV VITE_BASE=/handkassen/
RUN npm run build
# Ergebnis: /fe/dist (statische SPA, Assets unter /handkassen/)

# ---- Stufe 2: Backend bauen (TypeScript -> dist) ----
FROM node:20-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm install
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build
# Ergebnis: /app/dist (kompilierte API)

# ---- Stufe 3: Laufzeit-Image ----
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Abhaengigkeiten (inkl. Prisma-CLI fuer "migrate deploy" beim Start)
COPY backend/package*.json ./
RUN npm install
COPY backend/prisma ./prisma
RUN npx prisma generate

# Kompiliertes Backend + gebautes Frontend uebernehmen
COPY --from=backend /app/dist ./dist
COPY --from=frontend /fe/dist ./public

# Quellordner mitnehmen: der Seed (prisma/seed.ts) importiert aus ../src und
# wird ueber tsx ausgefuehrt. Ohne src schluege "npm run seed" fehl.
COPY backend/src ./src

RUN mkdir -p /app/uploads

# Produktivbetrieb: secure-Cookies an, SPA aus /app/public ausliefern.
ENV NODE_ENV=production
ENV STATIC_DIR=/app/public

EXPOSE 3001

# Beim Start: Migrationen anwenden, Startdaten sicherstellen (seed ist idempotent
# - alles upsert; darf "weich" scheitern), dann Server starten.
# - Migration mit Backoff (bis 6 Versuche, 10s Pause): faengt kurze DB-Aussetzer
#   ab, statt in eine enge Crash-Loop zu laufen.
# - "exec node": node wird PID 1, damit Dockers SIGTERM den Prozess erreicht
#   (sauberes Herunterfahren).
CMD ["sh", "-c", "n=0; until npx prisma migrate deploy; do n=$((n+1)); if [ $n -ge 6 ]; then echo 'Migration nach 6 Versuchen fehlgeschlagen - Abbruch'; exit 1; fi; echo \"Migration fehlgeschlagen (Versuch $n/6) - erneuter Versuch in 10s...\"; sleep 10; done && (npm run seed || echo 'Seed uebersprungen') && exec node dist/server.js"]
