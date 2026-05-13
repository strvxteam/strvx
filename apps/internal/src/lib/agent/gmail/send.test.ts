import { describe, it, expect, vi } from "vitest";
import { buildMimeMessage, sendViaMailbox } from "./send";
import type { gmail_v1 } from "googleapis";

describe("buildMimeMessage", () => {
  it("builds a basic plaintext message with proper headers", () => {
    const mime = buildMimeMessage({
      fromEmail: "team@strvx.com",
      fromName: "strvx",
      to: ["sarah@acme.com"],
      cc: [],
      bcc: [],
      subject: "Re: discovery slots",
      bodyText: "thanks Sarah — Tuesday 11am works.",
    });

    expect(mime).toContain("From: strvx <team@strvx.com>");
    expect(mime).toContain("To: sarah@acme.com");
    expect(mime).toContain("Subject: Re: discovery slots");
    expect(mime).toContain("Content-Type: text/plain");
    expect(mime).toContain("thanks Sarah");
  });

  it("includes In-Reply-To and References when replying", () => {
    const mime = buildMimeMessage({
      fromEmail: "team@strvx.com",
      to: ["sarah@acme.com"],
      cc: [],
      bcc: [],
      subject: "Re: hi",
      bodyText: "hi back",
      inReplyTo: "<msg-1@acme.com>",
      references: ["<thread-1@acme.com>", "<msg-1@acme.com>"],
    });
    expect(mime).toContain("In-Reply-To: <msg-1@acme.com>");
    expect(mime).toContain(
      "References: <thread-1@acme.com> <msg-1@acme.com>"
    );
  });

  it("encodes the body to base64url for Gmail API consumption", () => {
    const mime = buildMimeMessage({
      fromEmail: "team@strvx.com",
      to: ["a@b.com"],
      cc: [],
      bcc: [],
      subject: "x",
      bodyText: "y",
    });
    expect(typeof mime).toBe("string");
  });

  it("handles multiple to/cc recipients", () => {
    const mime = buildMimeMessage({
      fromEmail: "team@strvx.com",
      to: ["a@x.com", "b@x.com"],
      cc: ["c@x.com"],
      bcc: ["d@x.com"],
      subject: "x",
      bodyText: "y",
    });
    expect(mime).toContain("To: a@x.com, b@x.com");
    expect(mime).toContain("Cc: c@x.com");
    expect(mime).toContain("Bcc: d@x.com");
  });
});

describe("sendViaMailbox", () => {
  it("calls gmail.users.messages.send with base64url-encoded raw + threadId", async () => {
    const sendMock = vi.fn().mockResolvedValue({
      data: { id: "sent-msg-id", threadId: "thread-id" },
    });
    const gmail = {
      users: { messages: { send: sendMock } },
    } as unknown as gmail_v1.Gmail;

    const result = await sendViaMailbox({
      gmail,
      threadId: "thread-id",
      fromEmail: "team@strvx.com",
      to: ["sarah@acme.com"],
      cc: [],
      bcc: [],
      subject: "hi",
      bodyText: "hi back",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.userId).toBe("me");
    expect(arg.requestBody.threadId).toBe("thread-id");
    expect(typeof arg.requestBody.raw).toBe("string");
    expect(arg.requestBody.raw).not.toMatch(/=$/);

    expect(result.gmailMessageId).toBe("sent-msg-id");
  });
});
