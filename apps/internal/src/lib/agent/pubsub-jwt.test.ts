import { describe, it, expect } from "vitest";
import { parseAuthHeaderToken, decodePubsubPushPayload } from "./pubsub-jwt";

describe("parseAuthHeaderToken", () => {
  it("extracts the JWT from a Bearer auth header", () => {
    expect(parseAuthHeaderToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("returns null when no header", () => {
    expect(parseAuthHeaderToken(null)).toBeNull();
  });

  it("returns null when prefix is wrong", () => {
    expect(parseAuthHeaderToken("Basic abc")).toBeNull();
  });

  it("returns null when token is empty", () => {
    expect(parseAuthHeaderToken("Bearer ")).toBeNull();
  });
});

describe("decodePubsubPushPayload", () => {
  it("decodes a standard Pub/Sub push envelope", () => {
    const inner = JSON.stringify({
      emailAddress: "team@strvx.com",
      historyId: "12345",
    });
    const envelope = {
      message: {
        data: Buffer.from(inner, "utf8").toString("base64"),
        messageId: "10",
        publishTime: "2026-05-11T10:00:00Z",
      },
      subscription:
        "projects/strvx-agent-prod/subscriptions/gmail-events-team-strvx",
    };
    const decoded = decodePubsubPushPayload(envelope);
    expect(decoded.emailAddress).toBe("team@strvx.com");
    expect(decoded.historyId).toBe("12345");
  });

  it("throws on missing message.data", () => {
    expect(() =>
      decodePubsubPushPayload({ message: {}, subscription: "x" } as unknown as Parameters<
        typeof decodePubsubPushPayload
      >[0])
    ).toThrow();
  });

  it("throws on invalid base64 / json", () => {
    const envelope = {
      message: { data: "not-base64!", messageId: "10", publishTime: "x" },
      subscription: "x",
    };
    expect(() => decodePubsubPushPayload(envelope)).toThrow();
  });
});
