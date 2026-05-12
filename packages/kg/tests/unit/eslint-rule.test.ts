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
        // neo4j-driver allowed inside packages/kg
        {
          filename: "/repo/packages/kg/src/client/neo4j.ts",
          code: "import neo4j from 'neo4j-driver'",
        },
        // curated @strvx/kg exports are allowed outside packages/kg
        {
          filename: "/repo/apps/internal/src/page.tsx",
          code: "import { findEntities } from '@strvx/kg'",
        },
        // createNeo4jClient allowed inside packages/kg itself
        {
          filename: "/repo/packages/kg/src/some-internal.ts",
          code: "import { createNeo4jClient } from '../../src/client/neo4j.js'",
        },
      ],
      invalid: [
        // direct neo4j-driver import outside packages/kg
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "import neo4j from 'neo4j-driver'",
          errors: [{ messageId: "disallowed" }],
        },
        // require('neo4j-driver') outside packages/kg
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "const x = require('neo4j-driver')",
          errors: [{ messageId: "disallowed" }],
        },
        // createNeo4jClient imported from @strvx/kg outside packages/kg
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "import { createNeo4jClient } from '@strvx/kg'",
          errors: [{ messageId: "createNeo4jClientOutsideKg" }],
        },
        // Neo4jClient type imported from @strvx/kg outside packages/kg
        {
          filename: "/repo/apps/internal/src/lib/q.ts",
          code: "import type { Neo4jClient } from '@strvx/kg'",
          errors: [{ messageId: "createNeo4jClientOutsideKg" }],
        },
      ],
    });
  });
});
