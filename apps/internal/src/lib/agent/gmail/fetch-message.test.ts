import { describe, it, expect, vi } from "vitest";
import type { gmail_v1 } from "googleapis";
import { parseMessage, fetchMessage } from "./fetch-message";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function makeBase(overrides: Partial<gmail_v1.Schema$Message> = {}): gmail_v1.Schema$Message {
  return {
    id: "msg-001",
    threadId: "thread-001",
    historyId: "12345",
    internalDate: "1700000000000",
    sizeEstimate: 1024,
    snippet: "Hello world",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "Bob <bob@example.com>" },
        { name: "Subject", value: "Test subject" },
        { name: "Message-ID", value: "<abc123@mail.example.com>" },
        { name: "Date", value: "Mon, 14 Nov 2023 22:13:20 +0000" },
      ],
      body: { data: b64url("Hello, world!") },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseMessage — body extraction
// ---------------------------------------------------------------------------

describe("parseMessage — plain text email", () => {
  it("sets bodyText, leaves bodyHtml undefined, no attachments", () => {
    const raw = makeBase();
    const msg = parseMessage(raw);
    expect(msg.bodyText).toBe("Hello, world!");
    expect(msg.bodyHtml).toBeUndefined();
    expect(msg.hasAttachments).toBe(false);
    expect(msg.attachments).toHaveLength(0);
  });
});

describe("parseMessage — HTML email", () => {
  it("sets bodyHtml from a text/html part", () => {
    const raw = makeBase({
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com" },
        ],
        body: { data: b64url("<p>Hello</p>") },
      },
    });
    const msg = parseMessage(raw);
    expect(msg.bodyHtml).toBe("<p>Hello</p>");
    expect(msg.bodyText).toBeUndefined();
  });
});

describe("parseMessage — multipart/alternative with text + html", () => {
  it("sets both bodyText and bodyHtml", () => {
    const raw = makeBase({
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com" },
        ],
        body: {},
        parts: [
          {
            mimeType: "text/plain",
            body: { data: b64url("Plain text body") },
          },
          {
            mimeType: "text/html",
            body: { data: b64url("<p>HTML body</p>") },
          },
        ],
      },
    });
    const msg = parseMessage(raw);
    expect(msg.bodyText).toBe("Plain text body");
    expect(msg.bodyHtml).toBe("<p>HTML body</p>");
  });
});

// ---------------------------------------------------------------------------
// parseMessage — attachments
// ---------------------------------------------------------------------------

describe("parseMessage — email with one attachment", () => {
  it("sets hasAttachments=true and populates attachments array", () => {
    const raw = makeBase({
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com" },
        ],
        body: {},
        parts: [
          {
            mimeType: "text/plain",
            body: { data: b64url("See attached") },
          },
          {
            mimeType: "application/pdf",
            filename: "report.pdf",
            body: {
              attachmentId: "attach-xyz-001",
              size: 20480,
            },
          },
        ],
      },
    });
    const msg = parseMessage(raw);
    expect(msg.hasAttachments).toBe(true);
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0]).toEqual({
      gmailAttachmentId: "attach-xyz-001",
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20480,
    });
  });
});

// ---------------------------------------------------------------------------
// parseMessage — direction
// ---------------------------------------------------------------------------

describe("parseMessage — direction", () => {
  it("returns outbound when SENT label is present", () => {
    const raw = makeBase({ labelIds: ["SENT", "INBOX"] });
    expect(parseMessage(raw).direction).toBe("outbound");
  });

  it("returns inbound when SENT label is absent", () => {
    const raw = makeBase({ labelIds: ["INBOX"] });
    expect(parseMessage(raw).direction).toBe("inbound");
  });
});

// ---------------------------------------------------------------------------
// parseMessage — From header parsing
// ---------------------------------------------------------------------------

describe("parseMessage — From header with display name", () => {
  it("extracts email and name from 'Sarah Doe <sarah@acme.com>'", () => {
    const raw = makeBase({
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: '"Sarah Doe" <sarah@acme.com>' },
          { name: "To", value: "bob@example.com" },
        ],
        body: { data: b64url("Hi") },
      },
    });
    const msg = parseMessage(raw);
    expect(msg.fromEmail).toBe("sarah@acme.com");
    expect(msg.fromName).toBe("Sarah Doe");
  });
});

describe("parseMessage — From header bare email", () => {
  it("sets fromEmail, leaves fromName undefined", () => {
    const raw = makeBase({
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "sarah@acme.com" },
          { name: "To", value: "bob@example.com" },
        ],
        body: { data: b64url("Hi") },
      },
    });
    const msg = parseMessage(raw);
    expect(msg.fromEmail).toBe("sarah@acme.com");
    expect(msg.fromName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseMessage — To with multiple addresses
// ---------------------------------------------------------------------------

describe("parseMessage — To header with multiple addresses", () => {
  it("parses all comma-separated recipient emails", () => {
    const raw = makeBase({
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "Bob <bob@example.com>, carol@example.com, Dave <dave@example.com>" },
        ],
        body: { data: b64url("Hi all") },
      },
    });
    const msg = parseMessage(raw);
    expect(msg.toEmails).toEqual(["bob@example.com", "carol@example.com", "dave@example.com"]);
  });
});

// ---------------------------------------------------------------------------
// parseMessage — missing subject
// ---------------------------------------------------------------------------

describe("parseMessage — missing Subject header", () => {
  it("leaves subject undefined", () => {
    const raw = makeBase({
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com" },
        ],
        body: { data: b64url("No subject here") },
      },
    });
    const msg = parseMessage(raw);
    expect(msg.subject).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseMessage — sentAt from internalDate
// ---------------------------------------------------------------------------

describe("parseMessage — sentAt", () => {
  it("uses internalDate when present", () => {
    const raw = makeBase({ internalDate: "1700000000000" });
    const msg = parseMessage(raw);
    expect(msg.sentAt).toEqual(new Date(1700000000000));
  });

  it("falls back to Date header when internalDate is absent", () => {
    const raw = makeBase({
      internalDate: undefined,
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com" },
          { name: "Date", value: "Tue, 15 Nov 2023 10:00:00 +0000" },
        ],
        body: { data: b64url("Hi") },
      },
    });
    const msg = parseMessage(raw);
    expect(msg.sentAt).toEqual(new Date("Tue, 15 Nov 2023 10:00:00 +0000"));
  });
});

// ---------------------------------------------------------------------------
// parseMessage — label flags
// ---------------------------------------------------------------------------

describe("parseMessage — UNREAD label", () => {
  it("isUnread=true when UNREAD label present", () => {
    const raw = makeBase({ labelIds: ["INBOX", "UNREAD"] });
    expect(parseMessage(raw).isUnread).toBe(true);
  });

  it("isUnread=false when UNREAD label absent", () => {
    const raw = makeBase({ labelIds: ["INBOX"] });
    expect(parseMessage(raw).isUnread).toBe(false);
  });
});

describe("parseMessage — STARRED label", () => {
  it("isStarred=true when STARRED label present", () => {
    const raw = makeBase({ labelIds: ["INBOX", "STARRED"] });
    expect(parseMessage(raw).isStarred).toBe(true);
  });

  it("isStarred=false when STARRED label absent", () => {
    const raw = makeBase({ labelIds: ["INBOX"] });
    expect(parseMessage(raw).isStarred).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseMessage — guard throws
// ---------------------------------------------------------------------------

describe("parseMessage — missing id", () => {
  it("throws with a descriptive message", () => {
    const raw = makeBase({ id: undefined });
    expect(() => parseMessage(raw)).toThrow("parseMessage: missing message id");
  });
});

describe("parseMessage — missing threadId", () => {
  it("throws with a descriptive message", () => {
    const raw = makeBase({ threadId: undefined });
    expect(() => parseMessage(raw)).toThrow("parseMessage: missing thread id");
  });
});

// ---------------------------------------------------------------------------
// fetchMessage — API call forwarding
// ---------------------------------------------------------------------------

describe("fetchMessage", () => {
  it("calls gmail.users.messages.get with userId=me, id, format=full and returns parsed result", async () => {
    const raw = makeBase();
    const getFn = vi.fn().mockResolvedValue({ data: raw });
    const gmail = {
      users: {
        messages: {
          get: getFn,
        },
      },
    } as unknown as gmail_v1.Gmail;

    const result = await fetchMessage(gmail, "msg-001");

    expect(getFn).toHaveBeenCalledOnce();
    expect(getFn).toHaveBeenCalledWith({
      userId: "me",
      id: "msg-001",
      format: "full",
    });
    expect(result.gmailMessageId).toBe("msg-001");
    expect(result.gmailThreadId).toBe("thread-001");
  });
});
