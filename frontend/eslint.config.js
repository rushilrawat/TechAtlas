import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist", "dist-xray", "dist-xray-test", "node_modules", "e2e",
      ".uia-shots", "screenshots",
      "playwright.config.ts", "playwright.xray.config.ts", "playwright.stackview.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
);
