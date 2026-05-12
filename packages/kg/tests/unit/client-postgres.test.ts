/**
 * Unit tests for createPostgresClient factory.
 * Mocks the postgres package so no real DB connection is needed.
 */
import { describe, expect, it, vi } from "vitest";

// Mock 'postgres' before importing the client module.
vi.mock("postgres", () => {
  const mockSql = vi.fn();
  return { default: vi.fn(() => mockSql) };
});

import { createPostgresClient } from "../../src/client/postgres.js";

describe("createPostgresClient", () => {
  it("returns a PostgresClient (Sql instance) from a URL", () => {
    const sql = createPostgresClient("postgres://user:pass@localhost:5432/db");
    // The mock returns the inner mockSql function
    expect(sql).toBeDefined();
  });

  it("calls postgres() with the provided URL", async () => {
    const { default: postgres } = await import("postgres");
    createPostgresClient("postgres://user:pass@localhost/test");
    expect(postgres).toHaveBeenCalledWith(
      "postgres://user:pass@localhost/test",
      expect.objectContaining({ prepare: false }),
    );
  });
});
