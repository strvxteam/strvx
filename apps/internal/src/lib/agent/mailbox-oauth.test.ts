import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildOAuthClientFromRow,
  classifyRefreshError,
  markMailboxRefreshFailure,
  REFRESH_FAILURE_DISABLE_THRESHOLD,
  type MailboxRow,
} from "./mailbox-oauth";
import { mailboxOauthTokens, type db as DbType } from "@strvx/db";
import { encrypt, generateKey } from "./encryption";

// ---------------------------------------------------------------------------
// markMailboxRefreshFailure mock-db helper
// ---------------------------------------------------------------------------

function makeUpdateMockDb(initialFailureCount: number) {
  let isActive = true;
  let refreshFailureCount = initialFailureCount;
  let lastRefreshError: string | null = null;

  const calls: Array<{ table: unknown; values: Record<string, unknown> }> = [];

  const update = vi.fn().mockImplementation((table: unknown) => ({
    set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
      calls.push({ table, values: v });
      // Simulate the sql increment + conditional
      if (table === mailboxOauthTokens) {
        // Increment first
        refreshFailureCount += 1;
        if (v.isActive === false) isActive = false;
        // If isActive is a sql snippet (transient case), pretend it's
        // computed: active becomes (failureCount < threshold)
        if (typeof v.isActive !== "boolean" && v.isActive !== undefined) {
          isActive = refreshFailureCount < REFRESH_FAILURE_DISABLE_THRESHOLD;
        }
        if (typeof v.lastRefreshError === "string") {
          lastRefreshError = v.lastRefreshError;
        }
      }
      return {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              isActive,
              refreshFailureCount,
            },
          ]),
        }),
      };
    }),
  }));

  return {
    db: { update } as unknown as typeof DbType,
    state: {
      get isActive() {
        return isActive;
      },
      get refreshFailureCount() {
        return refreshFailureCount;
      },
      get lastRefreshError() {
        return lastRefreshError;
      },
    },
    calls,
  };
}

describe("buildOAuthClientFromRow", () => {
  let key: string;
  let row: MailboxRow;

  beforeEach(() => {
    key = generateKey();
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = key;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "https://example.com/cb";

    row = {
      id: "11111111-1111-1111-1111-111111111111",
      email: "team@strvx.com",
      access_token_encrypted: encrypt("access-token-xyz", key),
      refresh_token_encrypted: encrypt("refresh-token-xyz", key),
      expiry_date: Date.now() + 60 * 60 * 1000,
      scopes: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      is_active: true,
    };
  });

  it("constructs an OAuth2 client with decrypted credentials", () => {
    const client = buildOAuthClientFromRow(row);
    const creds = client.credentials;
    expect(creds.access_token).toBe("access-token-xyz");
    expect(creds.refresh_token).toBe("refresh-token-xyz");
    expect(creds.expiry_date).toBe(row.expiry_date);
  });

  it("throws if mailbox is inactive", () => {
    row.is_active = false;
    expect(() => buildOAuthClientFromRow(row)).toThrow(/inactive/i);
  });

  it("throws if encryption key is missing", () => {
    delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    expect(() => buildOAuthClientFromRow(row)).toThrow(/OAUTH_TOKEN_ENCRYPTION_KEY/);
  });
});

describe("classifyRefreshError", () => {
  it("classifies invalid_grant as definitive", () => {
    expect(
      classifyRefreshError(new Error("invalid_grant: bad refresh"))
    ).toBe("definitive");
  });
  it("classifies token revoked as definitive", () => {
    expect(
      classifyRefreshError(
        new Error("Token has been expired or revoked.")
      )
    ).toBe("definitive");
  });
  it("classifies invalid_token as definitive", () => {
    expect(classifyRefreshError(new Error("invalid_token"))).toBe(
      "definitive"
    );
  });
  it("classifies unauthorized_client as definitive", () => {
    expect(classifyRefreshError(new Error("unauthorized_client"))).toBe(
      "definitive"
    );
  });
  it("classifies network errors as transient", () => {
    expect(classifyRefreshError(new Error("ECONNRESET"))).toBe("transient");
    expect(classifyRefreshError(new Error("ETIMEDOUT"))).toBe("transient");
    expect(classifyRefreshError(new Error("socket hang up"))).toBe(
      "transient"
    );
  });
  it("handles non-Error inputs", () => {
    expect(classifyRefreshError(null)).toBe("transient");
    expect(classifyRefreshError("invalid_grant")).toBe("definitive");
  });
});

describe("markMailboxRefreshFailure", () => {
  it("flips is_active=false immediately on a definitive error", async () => {
    const { db, state } = makeUpdateMockDb(0);
    const result = await markMailboxRefreshFailure({
      mailboxId: "mb-1",
      error: new Error("invalid_grant: bad refresh"),
      db,
    });
    expect(result.kind).toBe("definitive");
    expect(result.disabled).toBe(true);
    expect(state.isActive).toBe(false);
    expect(state.lastRefreshError).toContain("invalid_grant");
  });

  it("increments count on transient errors but stays active under threshold", async () => {
    // initial=0, transient hit -> count becomes 1, still active
    const { db, state } = makeUpdateMockDb(0);
    const result = await markMailboxRefreshFailure({
      mailboxId: "mb-2",
      error: new Error("ECONNRESET"),
      db,
    });
    expect(result.kind).toBe("transient");
    expect(result.disabled).toBe(false);
    expect(state.isActive).toBe(true);
    expect(state.refreshFailureCount).toBe(1);
  });

  it("flips is_active=false once transient count reaches threshold", async () => {
    const { db, state } = makeUpdateMockDb(
      REFRESH_FAILURE_DISABLE_THRESHOLD - 1
    );
    const result = await markMailboxRefreshFailure({
      mailboxId: "mb-3",
      error: new Error("temporary network blip"),
      db,
    });
    expect(result.kind).toBe("transient");
    expect(result.disabled).toBe(true);
    expect(state.isActive).toBe(false);
    expect(state.refreshFailureCount).toBe(
      REFRESH_FAILURE_DISABLE_THRESHOLD
    );
  });

  it("truncates very long error messages to 1000 chars", async () => {
    const { db, state } = makeUpdateMockDb(0);
    await markMailboxRefreshFailure({
      mailboxId: "mb-4",
      error: new Error("x".repeat(5000)),
      db,
    });
    expect((state.lastRefreshError ?? "").length).toBeLessThanOrEqual(1000);
  });
});
