# Mehrstufiger Build: Portal-SPA + Suite-Backend in EINEM Image.
# Build-Kontext = OEHTB-Suite-Wurzel (docker-compose: build.context = ".",
# dockerfile = "backend/Dockerfile"). Basis node:20-slim (Debian) wegen Prisma.

# ---- Stufe 1: Portal-Frontend bauen ----
FROM node:20-slim AS portal
WORKDIR /fe
COPY portal/package*.json ./
RUN npm install
COPY portal/ ./
RUN npm run build
# Ergebnis: /fe/dist (statische SPA, unter "/")

# ---- Stufe 2: Backend bauen ----
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

# ---- Stufe 3: Laufzeit ----
FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY --from=backend /app/dist ./dist
# Seed-Skript verfuegbar halten (idempotent, upsert). tsx ist eine regulaere
# dependency und wird oben mit "npm install --omit=dev" ins Image gebaut, damit
# der Seed beim Start nicht bei jedem Boot tsx aus dem Netz nachladen muss.
COPY backend/prisma/seed.ts ./prisma/seed.ts
COPY --from=portal /fe/dist ./static

EXPOSE 3000
# Beim Start: Schema migrieren, Tool-Registry + Admin sicherstellen (idempotent),
# dann Server starten. STATIC_DIR liefert die Portal-SPA aus.
# - Migration mit Backoff (bis 6 Versuche, 10s Pause): faengt kurze DB-Aussetzer
#   ab, statt in eine enge Crash-Loop zu laufen.
# - "exec node": node ersetzt die Shell und wird PID 1, damit Dockers SIGTERM
#   den Prozess erreicht (sauberes Herunterfahren).
CMD ["sh", "-c", "n=0; until npx prisma migrate deploy; do n=$((n+1)); if [ $n -ge 6 ]; then echo 'Migration nach 6 Versuchen fehlgeschlagen - Abbruch'; exit 1; fi; echo \"Migration fehlgeschlagen (Versuch $n/6) - erneuter Versuch in 10s...\"; sleep 10; done && npx tsx prisma/seed.ts && exec node dist/index.js"]
