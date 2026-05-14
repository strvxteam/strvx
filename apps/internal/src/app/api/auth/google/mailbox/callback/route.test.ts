import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock state so each test can re-wire it.
const { getUserMock, getTokenMock, userinfoGetMock, dbSelectMock } =
  vi.hoisted(() => ({
    getUserMock: vi.fn(),
    getTokenMock: vi.fn(),
    userinfoGetMock: vi.fn(),
    dbSelectMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        getToken = getTokenMock;
        setCredentials = vi.fn();
      },
    },
    oauth2: () => ({
      userinfo: { get: userinfoGetMock },
    }),
  },
}));

vi.mock("@strvx/db", () => ({
  db: {
    select: dbSelectMock,
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  mailboxOauthTokens: { email: "email", id: "id" },
}));

vi.mock("@/lib/agent/encryption", () => ({
  encrypt: (s: string) => `enc(${s})`,
  getEncryptionKey: () => "test-key",
}));

import { GET } from "./route";

function makeRequest(opts: {
  state?: string;
  cookieState?: string;
  cookieInitiator?: string;
  cookieReturnTo?: string;
  code?: string;
  error?: string;
}) {
  const params = new URLSearchParams();
  if (opts.code) params.set("code", opts.code);
  if (opts.error) params.set("error", opts.error);
  if (opts.state !== undefined) params.set("state", opts.state);
  const url = `http://localhost/api/auth/google/mailbox/callback?${params}`;
  const cookieParts: string[] = [];
  if (opts.cookieState !== undefined) {
    cookieParts.push(`mailbox_oauth_state=${opts.cookieState}`);
  }
  if (opts.cookieInitiator !== undefined) {
    cookieParts.push(`mailbox_oauth_initiated_by=${opts.cookieInitiator}`);
  }
  if (opts.cookieReturnTo !== undefined) {
    cookieParts.push(`mailbox_oauth_return_to=${opts.cookieReturnTo}`);
  }
  return {
    url,
    nextUrl: new URL(url),
    cookies: {
      get: (name: string) => {
        const part = cookieParts.find((p) => p.startsWith(`${name}=`));
        if (!part) return undefined;
        return { value: part.slice(name.length + 1) };
      },
    },
    headers: new Headers(),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({
    data: { user: { id: "user-abc", email: "admin@strvx.com" } },
  });
  dbSelectMock.mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
  });
  getTokenMock.mockResolvedValue({
    tokens: {
      access_token: "at",
      refresh_token: "rt",
      expiry_date: Date.now() + 3600_000,
      scope: "gmail.modify gmail.send",
    },
  });
  userinfoGetMock.mockResolvedValue({
    data: { email: "team@strvx.com", name: "Team Strvx" },
  });
});

describe("mailbox oauth callback — security paths", () => {
  it("returns 401 when no authenticated session", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET(makeRequest({ code: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when authenticated user isn't @strvx.com", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u", email: "rando@example.com" } },
    });
    const res = await GET(makeRequest({ code: "x" }));
    expect(res.status).toBe(401);
  });

  it("redirects to error=state_mismatch when state param is missing", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        cookieState: "abc",
        cookieInitiator: "user-abc",
      })
    );
    expect(res.headers.get("location")).toContain("error=state_mismatch");
  });

  it("redirects to error=state_mismatch when state cookie is missing", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieInitiator: "user-abc",
      })
    );
    expect(res.headers.get("location")).toContain("error=state_mismatch");
  });

  it("redirects to error=state_mismatch when state and cookie disagree", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "def",
        cookieInitiator: "user-abc",
      })
    );
    expect(res.headers.get("location")).toContain("error=state_mismatch");
  });

  it("redirects to error=initiator_mismatch when initiator cookie is missing", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
      })
    );
    expect(res.headers.get("location")).toContain("error=initiator_mismatch");
  });

  it("redirects to error=initiator_mismatch when initiator cookie != session user", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
        cookieInitiator: "attacker-id",
      })
    );
    expect(res.headers.get("location")).toContain("error=initiator_mismatch");
  });

  it("happy path: state + initiator valid, redirects to mailboxes tab with connected=", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
        cookieInitiator: encodeURIComponent("user-abc"),
      })
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/agent/settings");
    expect(loc).toContain("tab=mailboxes");
    expect(loc).toContain("connected=team%40strvx.com");
    expect(loc).not.toContain("error=");
  });

  it("rejects an open-redirect return_to cookie and falls back to defaults", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
        cookieInitiator: encodeURIComponent("user-abc"),
        cookieReturnTo: encodeURIComponent("//evil.com/path"),
      })
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).not.toContain("evil.com");
    expect(loc).toContain("/agent/settings?tab=mailboxes");
  });

  it("rejects backslash-host return_to and falls back to defaults", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
        cookieInitiator: encodeURIComponent("user-abc"),
        cookieReturnTo: encodeURIComponent("/\\\\evil.com/path"),
      })
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).not.toContain("evil.com");
    expect(loc).toContain("/agent/settings?tab=mailboxes");
  });

  it("rejects absolute-URL return_to and falls back to defaults", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
        cookieInitiator: encodeURIComponent("user-abc"),
        cookieReturnTo: encodeURIComponent("https://evil.com/path"),
      })
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).not.toContain("evil.com");
    expect(loc).toContain("/agent/settings?tab=mailboxes");
  });

  it("accepts a safe relative return_to path", async () => {
    const res = await GET(
      makeRequest({
        code: "x",
        state: "abc",
        cookieState: "abc",
        cookieInitiator: encodeURIComponent("user-abc"),
        cookieReturnTo: encodeURIComponent("/agent/follow-ups"),
      })
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/agent/follow-ups?connected=");
  });
});
