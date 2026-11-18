// Flache ESLint-Konfiguration (ESLint 10) fuer die gesamte Suite.
// Bewusst NICHT typ-aware (kein tsconfig-Projektbezug): schnell, ohne die
// Teilprojekte verketten zu muessen. Ziel ist ein sinnvolles Grundnetz gegen
// echte Fehler – kein Stil-Kleinkrieg (das uebernimmt Prettier).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    // Generiertes / Gebautes / Fremdes nicht linten.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/static/**",
      "**/public/**",
      "**/coverage/**",
      "**/prisma/migrations/**",
      // Prisma 7: generierter Client
      "**/src/generated/**",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Ungenutzte Variablen als Warnung; fuehrendes "_" erlaubt bewusst ignorierte.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Pragmatisch fuer diese Codebasis: "any" kommt an Prisma-JSON-Grenzen vor.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Frontends: die zwei klassischen Hook-Regeln. Bewusst NICHT das
    // "recommended"-Paket des Plugins – das bringt die strengen
    // React-Compiler-Regeln mit, die hier nicht verwendet werden.
    files: ["portal/src/**/*.{ts,tsx}", "*/frontend/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Tests duerfen lockerer sein.
    files: ["**/*.test.ts", "**/*.integration.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
