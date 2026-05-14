/**
 * ESLint rule: forbid `import 'neo4j-driver'` (and dynamic equivalents) anywhere
 * outside the `@strvx/kg` package. All Neo4j access must go through `packages/kg`.
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct neo4j-driver imports outside @strvx/kg",
    },
    schema: [],
    messages: {
      disallowed:
        "Direct `neo4j-driver` imports are forbidden outside packages/kg. Use the @strvx/kg public API.",
      createNeo4jClientOutsideKg:
        "Importing 'createNeo4jClient' or 'Neo4jClient' from '@strvx/kg' is forbidden outside packages/kg. Use the curated read/write functions (getNode, findEntities, recordObservation, etc.) instead.",
    },
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : context.filename;
    if (filename && filename.includes("/packages/kg/")) return {};
    function checkDriverImport(value, node) {
      if (
        typeof value === "string" &&
        (value === "neo4j-driver" || value.startsWith("neo4j-driver/"))
      ) {
        context.report({ node, messageId: "disallowed" });
      }
    }
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (typeof src !== "string") return;
        // Direct neo4j-driver import (including subpath imports)
        if (src === "neo4j-driver" || src.startsWith("neo4j-driver/")) {
          context.report({ node, messageId: "disallowed" });
          return;
        }
        // @strvx/kg factory / type import
        if (src === "@strvx/kg" || src.startsWith("@strvx/kg/")) {
          const forbiddenNames = new Set(["createNeo4jClient", "Neo4jClient"]);
          for (const spec of node.specifiers ?? []) {
            if (
              spec.type === "ImportSpecifier" &&
              spec.imported &&
              forbiddenNames.has(spec.imported.name)
            ) {
              context.report({ node: spec, messageId: "createNeo4jClientOutsideKg" });
            }
          }
        }
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") checkDriverImport(node.source.value, node);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0] &&
          node.arguments[0].type === "Literal"
        ) {
          checkDriverImport(node.arguments[0].value, node);
        }
      },
    };
  },
};
