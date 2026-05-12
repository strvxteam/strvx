import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import rule from "../../src/eslint/no-neo4j-outside-kg.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-neo4j-outside-kg rule", () => {
  it("flags direct neo4j-driver imports outside packages/kg", () => {
    tester.run("no-neo4j-outside-kg", rule as any, {
      valid: [
        {
          filename: "/repo/packages/kg/src/client/neo4j.ts",
          code: "import neo4j from 'neo4j-driver'",
        },
        {
          filename: "/repo/apps/internal/src/page.tsx",
          code: "import { findEntities } from '@strvx/kg'",
        },
      ],
      invalid: [
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "import neo4j from 'neo4j-driver'",
          errors: [{ messageId: "disallowed" }],
        },
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "const x = require('neo4j-driver')",
          errors: [{ messageId: "disallowed" }],
        },
      ],
    });
  });
});
