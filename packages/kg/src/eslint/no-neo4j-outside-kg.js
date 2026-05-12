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
    },
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : context.filename;
    if (filename && filename.includes("/packages/kg/")) return {};
    function check(value, node) {
      if (typeof value === "string" && value === "neo4j-driver") {
        context.report({ node, messageId: "disallowed" });
      }
    }
    return {
      ImportDeclaration(node) {
        check(node.source.value, node);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node.source.value, node);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0] &&
          node.arguments[0].type === "Literal"
        ) {
          check(node.arguments[0].value, node);
        }
      },
    };
  },
};
