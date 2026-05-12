import { describe, expect, it } from "vitest";
import {
  assertReadOnly,
  CypherMalformedError,
  CypherWriteAttemptError,
} from "../../src/cypher/validate.js";

describe("assertReadOnly", () => {
  const reads = [
    "MATCH (n:Person) RETURN n",
    "MATCH (a)-[r]->(b) WHERE a.name = 'x' RETURN r",
    "CALL db.indexes() YIELD name RETURN name",
    "RETURN 1 AS one",
    "MATCH (n) WHERE n.name CONTAINS 'CREATE' RETURN n",
    "MATCH (n) WHERE n.name CONTAINS 'LOAD CSV' RETURN n",
    "// CREATE a comment\nMATCH (n) RETURN n",
    "/* CREATE */ MATCH (n) RETURN n",
  ];
  const writes = [
    "CREATE (n:Person {name: 'x'}) RETURN n",
    "match (n) create (m) return m",
    "MERGE (n:Person {email: 'x'}) RETURN n",
    "MATCH (n) SET n.x = 1 RETURN n",
    "MATCH (n) DELETE n",
    "MATCH (n) DETACH DELETE n",
    "MATCH (n) REMOVE n.x",
    "CALL { MATCH (n) CREATE (m) RETURN m } RETURN 1",
    "LOAD CSV FROM 'file:///etc/passwd' AS line RETURN line",
    "load    csv from 'http://evil/x.csv' as line return line",
  ];

  for (const q of reads) {
    it(`accepts read: ${q.slice(0, 40)}`, () => {
      expect(() => assertReadOnly(q)).not.toThrow();
    });
  }
  for (const q of writes) {
    it(`rejects write: ${q.slice(0, 40)}`, () => {
      expect(() => assertReadOnly(q)).toThrow(CypherWriteAttemptError);
    });
  }

  it("throws CypherMalformedError on unterminated block comment", () => {
    expect(() => assertReadOnly("/* CREATE never closes MATCH (n) RETURN n")).toThrow(
      CypherMalformedError,
    );
  });

  it("throws CypherMalformedError on unterminated string literal", () => {
    expect(() => assertReadOnly("MATCH (n) WHERE n.x = 'oops CREATE RETURN n")).toThrow(
      CypherMalformedError,
    );
  });
});
