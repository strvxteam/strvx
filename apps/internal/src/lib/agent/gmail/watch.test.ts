import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupGmailWatch, renewGmailWatch } from "./watch";
import type { gmail_v1 } from "googleapis";

type GmailMock = {
  users: {
    watch: ReturnType<typeof vi.fn>;
  };
};

function makeGmailMock(historyId: string, expirationMs: number): GmailMock {
  return {
    users: {
      watch: vi.fn().mockResolvedValue({
        data: { historyId, expiration: String(expirationMs) },
      }),
    },
  };
}

describe("setupGmailWatch", () => {
  beforeEach(() => {
    process.env.GOOGLE_PUBSUB_TOPIC =
      "projects/strvx-agent-prod/topics/gmail-events";
  });

  it("calls gmail.users.watch with INBOX+SENT label filter and the configured topic", async () => {
    const gmail = makeGmailMock("12345", Date.now() + 6 * 24 * 3600 * 1000);
    const result = await setupGmailWatch({
      gmail: gmail as unknown as gmail_v1.Gmail,
      mailboxId: "mailbox-id",
    });

    expect(gmail.users.watch).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        topicName: "projects/strvx-agent-prod/topics/gmail-events",
        labelIds: ["INBOX", "SENT"],
        labelFilterBehavior: "INCLUDE",
      },
    });

    expect(result.historyId).toBe("12345");
    expect(result.expiration).toBeInstanceOf(Date);
  });

  it("throws if GOOGLE_PUBSUB_TOPIC env is not set", async () => {
    delete process.env.GOOGLE_PUBSUB_TOPIC;
    const gmail = makeGmailMock("1", Date.now());
    await expect(
      setupGmailWatch({
        gmail: gmail as unknown as gmail_v1.Gmail,
        mailboxId: "x",
      })
    ).rejects.toThrow(/GOOGLE_PUBSUB_TOPIC/);
  });

  it("throws if gmail.users.watch returns no historyId", async () => {
    const gmail: GmailMock = {
      users: {
        watch: vi.fn().mockResolvedValue({ data: { expiration: "1" } }),
      },
    };
    await expect(
      setupGmailWatch({
        gmail: gmail as unknown as gmail_v1.Gmail,
        mailboxId: "x",
      })
    ).rejects.toThrow(/historyId/);
  });
});

describe("renewGmailWatch", () => {
  beforeEach(() => {
    process.env.GOOGLE_PUBSUB_TOPIC =
      "projects/strvx-agent-prod/topics/gmail-events";
  });

  it("re-calls watch and returns the new historyId + expiration", async () => {
    const gmail = makeGmailMock("99999", Date.now() + 7 * 24 * 3600 * 1000);
    const result = await renewGmailWatch({
      gmail: gmail as unknown as gmail_v1.Gmail,
      mailboxId: "mailbox-id",
    });
    expect(gmail.users.watch).toHaveBeenCalled();
    expect(result.historyId).toBe("99999");
  });
});
