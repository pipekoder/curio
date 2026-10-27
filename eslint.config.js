import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
// New vertical-slice modules are linted strictly; existing legacy files retain
// their established test coverage until a separate lint adoption pass.
export default ts.config(
  { ignores: ["node_modules/**", "dist/**", ".wrangler/**"] },
  {
    files: [
      "shared/editorial*.ts",
      "worker/editorial.ts",
      "scripts/editorial-live-check.mjs",
      "scripts/editorial-validation-smoke.mjs",
      "scripts/production-review.mjs",
      "src/EditorialExperience.tsx",
      "src/App.tsx",
      "tests/editorial*.ts",
    ],
    extends: [js.configs.recommended, ...ts.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
