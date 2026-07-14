// Flache ESLint-Konfiguration (ESLint 9) fuer die gesamte Suite.
// Bewusst NICHT typ-aware (kein tsconfig-Projektbezug): schnell, ohne die drei
// Teilprojekte verketten zu muessen. Ziel ist ein sinnvolles Grundnetz gegen
// echte Fehler – kein Stil-Kleinkrieg (das uebernimmt Prettier).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
    // Tests duerfen lockerer sein.
    files: ["**/*.test.ts", "**/*.integration.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
