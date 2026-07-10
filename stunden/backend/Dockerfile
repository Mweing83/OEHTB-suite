# Mehrstufiger Build: Frontend (SPA) + Backend (API) in EINEM Image.
# Das Backend liefert im Produktivbetrieb die gebaute Oberflaeche und die API
# auf demselben Port aus (Single-Origin). Der Suite-Reverse-Proxy legt den
# Pfad-Praefix "/stunden/" davor. Muster: handkassen/backend/Dockerfile.
#
# Build-Kontext = Projekt-Stammverzeichnis "stunden" (docker-compose der Suite:
# build.context = ../stunden, dockerfile = backend/Dockerfile).
#
# Basis node:20-slim (Debian, nicht alpine): Prisma erkennt dort OpenSSL 3
# zuverlaessig (auf alpine sonst "failed to detect libssl").

# ---- Stufe 1: Frontend bauen (mit Pfad-Praefix /stunden/) ----
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ENV VITE_BASE=/stunden/
RUN npm run build
# Ergebnis: /fe/dist (statische SPA, Assets unter /stunden/)

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

# ---- Stufe 3: Laufzeit-Image ----
FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY --from=backend /app/dist ./dist
# Gebautes Frontend fuer die statische Auslieferung (STATIC_DIR).
COPY --from=frontend /fe/dist ./static

EXPOSE 3002
# Migrationen beim Start anwenden, dann Server starten.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
