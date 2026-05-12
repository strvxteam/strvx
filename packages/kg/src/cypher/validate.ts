/**
 * Read-only enforcement for `runCypher` (v1 implementation).
 *
 * Strategy: regex-tokenize the query, stripping string literals and comments,
 * then check for forbidden keywords. The Neo4j read-only user is the
 * defense-in-depth floor — even if a pattern slips past this validator, the
 * database rejects the write.
 *
 * Forbidden top-level keywords: CREATE, MERGE, SET, DELETE, REMOVE.
 *
 * v1.5: upgrade to a proper Cypher AST parser.
 */

export class CypherWriteAttemptError extends Error {
  constructor(keyword: string, query: string) {
    super(`Cypher write attempt detected (${keyword}) in: ${query.slice(0, 100)}`);
    this.name = "CypherWriteAttemptError";
  }
}

const FORBIDDEN = ["CREATE", "MERGE", "SET", "DELETE", "REMOVE"] as const;

export function assertReadOnly(query: string): void {
  const stripped = stripLiteralsAndComments(query);
  const upper = stripped.toUpperCase();
  for (const kw of FORBIDDEN) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      throw new CypherWriteAttemptError(kw, query);
    }
  }
}

function stripLiteralsAndComments(q: string): string {
  let out = "";
  let i = 0;
  while (i < q.length) {
    const c = q[i];
    // line comment: // ... \n
    if (c === "/" && q[i + 1] === "/") {
      while (i < q.length && q[i] !== "\n") i++;
      continue;
    }
    // block comment: /* ... */
    if (c === "/" && q[i + 1] === "*") {
      i += 2;
      while (i < q.length && !(q[i] === "*" && q[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // string literals: '...' or "..." or `...` (back-ticked identifiers)
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      i++;
      while (i < q.length && q[i] !== quote) {
        if (q[i] === "\\") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
