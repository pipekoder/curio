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
      "dev/*.ts",
      "tests/norm*.ts",
      "scripts/norm-local-validation.mjs",
      "scripts/*acceptance*.mjs",
      "scripts/production-smoke.mjs",
      "scripts/prepare-original-raster.mjs",
      "shared/visual-observations.ts",
      "worker/editorial-visual-context.ts",
      "worker/asset-contracts.ts",
      "worker/asset-api.ts",
      "worker/asset-store.ts",
      "worker/asset-sources.ts",
      "shared/decoder.ts",
      "tests/living-ad.test.tsx",
      "tests/browser/sam.tsx",
      "worker/asset-classifier.ts",
      "worker/asset-retrieval.ts",
      "src/LivingAdvertisement.tsx",
      "tests/visual*.ts",
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
