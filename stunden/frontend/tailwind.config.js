/** @type {import('tailwindcss').Config} */
// OEHTB-Suite – gemeinsame Design-Tokens (identisch in allen drei Werkzeugen:
// portal, handkassen/frontend, stunden/frontend). Kein geteiltes Paket – die
// Datei wird bewusst dupliziert, damit jedes Werkzeug eigenstaendig baubar bleibt.
//
// Leitidee: ruhig, kontrastreich, vertrauenswuerdig. Barrierefreiheit ist bei der
// OEHTB Programm, nicht Zierde – daher kraeftige Kontraste und klare Flaechen.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Marken-Blau (tiefes, institutionelles Navy). marke-900 traegt die
        // Kopfleiste (Weiss darauf ~11:1, AAA), marke-600 die Aktionen
        // (auf Weiss ~6.4:1, AA fuer Fliesstext).
        marke: {
          50: "#f0f5fb",
          100: "#dbe8f6",
          200: "#bdd3ec",
          300: "#8fb4de",
          400: "#5b8fcb",
          500: "#3670b4",
          600: "#255a98",
          700: "#1f4a7d",
          800: "#1d3f68",
          900: "#1b3557",
          950: "#12233b",
        },
        // Semantische Statusfarben (Erfolg / Warnung / Gefahr).
        erfolg: { 50: "#ecfdf5", 600: "#059669", 700: "#047857" },
        warnung: { 50: "#fffbeb", 600: "#d97706", 700: "#b45309" },
        gefahr: { 50: "#fef2f2", 600: "#dc2626", 700: "#b91c1c" },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
