/**
 * Unit tests for createNeo4jClient factory.
 * Mocks neo4j-driver so no real driver or network is needed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createNeo4jClient } from "../../src/client/neo4j.js";

// ── mock neo4j-driver ──────────────────────────────────────────────────────

const mockSession = {
  executeRead: vi.fn(),
  executeWrite: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockDriver = {
  session: vi.fn(() => mockSession),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("neo4j-driver", () => {
  const driverFn = vi.fn(() => mockDriver);
  return {
    default: {
      driver: driverFn,
      auth: { basic: vi.fn((u, p) => ({ scheme: "basic", principal: u, credentials: p })) },
      session: { READ: "READ", WRITE: "WRITE" },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.executeRead.mockReset();
  mockSession.executeWrite.mockReset();
  mockSession.close.mockResolvedValue(undefined);
  mockDriver.close.mockResolvedValue(undefined);
});

const opts = {
  uri: "bolt://localhost:7687",
  rw: { user: "neo4j", password: "password" },
  ro: { user: "neo4j_ro", password: "password_ro" },
};

describe("createNeo4jClient", () => {
  it("creates a client with read/write/rawSession/close methods", () => {
    const client = createNeo4jClient(opts);
    expect(client).toHaveProperty("read");
    expect(client).toHaveProperty("write");
    expect(client).toHaveProperty("rawSession");
    expect(client).toHaveProperty("close");
  });

  it("read() calls executeRead on the ro session", async () => {
    const work = vi.fn().mockResolvedValue("result");
    mockSession.executeRead.mockImplementation((fn: unknown) => (fn as () => unknown)());
    const client = createNeo4jClient(opts);
    await client.read(work);
    expect(mockSession.executeRead).toHaveBeenCalledOnce();
  });

  it("write() calls executeWrite on the rw session", async () => {
    const work = vi.fn().mockResolvedValue("result");
    mockSession.executeWrite.mockImplementation((fn: unknown) => (fn as () => unknown)());
    const client = createNeo4jClient(opts);
    await client.write(work);
    expect(mockSession.executeWrite).toHaveBeenCalledOnce();
  });

  it("rawSession('read') returns a session", () => {
    const client = createNeo4jClient(opts);
    const session = client.rawSession("read");
    expect(session).toBeDefined();
    expect(mockDriver.session).toHaveBeenCalled();
  });

  it("rawSession('write') returns a session", () => {
    const client = createNeo4jClient(opts);
    const session = client.rawSession("write");
    expect(session).toBeDefined();
  });

  it("close() closes both drivers", async () => {
    const client = createNeo4jClient(opts);
    await client.close();
    // Both rw and ro drivers were closed (two driver instances → two close calls)
    expect(mockDriver.close).toHaveBeenCalledTimes(2);
  });

  it("uses 'neo4j' as default database name", async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    mockSession.executeRead.mockImplementation((fn: unknown) => (fn as () => unknown)());
    const client = createNeo4jClient(opts);
    await client.read(work);
    expect(mockDriver.session).toHaveBeenCalledWith(
      expect.objectContaining({ database: "neo4j" }),
    );
  });

  it("accepts a custom database name", async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    mockSession.executeRead.mockImplementation((fn: unknown) => (fn as () => unknown)());
    const client = createNeo4jClient({ ...opts, database: "mydb" });
    await client.read(work);
    expect(mockDriver.session).toHaveBeenCalledWith(
      expect.objectContaining({ database: "mydb" }),
    );
  });
});
