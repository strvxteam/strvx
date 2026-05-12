import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noNeo4jRule from "../../packages/kg/src/eslint/no-neo4j-outside-kg.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    ".gstack/**",
    ".context/**",
  ]),
  {
    plugins: {
      kg: {
        rules: {
          "no-neo4j-outside-kg": noNeo4jRule,
        },
      },
    },
    rules: {
      "kg/no-neo4j-outside-kg": "error",
    },
  },
]);

export default eslintConfig;
