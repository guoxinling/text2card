import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "output/**", "dist/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["script.js", "export.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["server.js", "eslint.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
