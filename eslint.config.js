import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Generated / build output — never linted.
  {
    ignores: [
      "dist",
      "src-tauri/target",
      "src-tauri/target-*",
      "src-tauri/gen",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["output/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Generated shadcn/ui primitives intentionally export variant helpers
    // (e.g. buttonVariants) alongside the component, which the fast-refresh
    // rule flags. Not worth splitting every primitive into two files.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Context providers and Zustand stores deliberately colocate their hook /
    // store with a provider component — the fast-refresh rule doesn't apply.
    files: ["src/context/**/*.{ts,tsx}", "src/stores/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  eslintConfigPrettier,
);
