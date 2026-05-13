import type { gmail_v1 } from "googleapis";

export type ParsedAttachment = {
  gmailAttachmentId: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type ParsedMessage = {
  gmailMessageId: string;
  gmailHistoryId?: string;
  gmailThreadId: string;
  messageIdHeader?: string;
  inReplyToHeader?: string;
  referencesHeader?: string;
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  direction: "inbound" | "outbound";
  sentAt: Date;
  labels: string[];
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  rawSize?: number;
  attachments: ParsedAttachment[];
};

/** Decode base64url (Gmail body encoding) to a UTF-8 string. */
function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/** Parse an address-list header like `"Sarah" <sarah@acme.com>, bob@x.com` -> ["sarah@acme.com", "bob@x.com"]. Returns emails only, lowercased, deduped. */
function parseAddressList(value: string | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // Match either `Name <email>` or bare email
  const pattern = /(?:"?([^"<,]+?)"?\s*<\s*([^>]+)\s*>)|([^\s,"<>]+@[^\s,"<>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(value)) !== null) {
    const email = (m[2] ?? m[3] ?? "").trim().toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

/** Parse a From header `"Sarah" <sarah@acme.com>` -> { email, name }. */
function parseFromHeader(value: string | undefined): { email: string; name?: string } {
  if (!value) return { email: "" };
  const pattern = /(?:"?([^"<]+?)"?\s*<\s*([^>]+)\s*>)|([^\s<>]+@[^\s<>]+)/;
  const m = pattern.exec(value.trim());
  if (!m) return { email: value.trim().toLowerCase() };
  const name = m[1]?.trim();
  const email = (m[2] ?? m[3] ?? "").trim().toLowerCase();
  return { email, name: name && name.length > 0 ? name : undefined };
}

function getHeader(message: gmail_v1.Schema$Message, name: string): string | undefined {
  const headers = message.payload?.headers ?? [];
  const lower = name.toLowerCase();
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === lower);
  return h?.value ?? undefined;
}

/** Recursively walk the MIME tree and extract plain + html body strings. */
function extractBodies(part: gmail_v1.Schema$MessagePart): {
  bodyText?: string;
  bodyHtml?: string;
} {
  const out: { bodyText?: string; bodyHtml?: string } = {};

  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/plain" && part.body?.data) {
    out.bodyText = decodeBase64Url(part.body.data);
  } else if (mime === "text/html" && part.body?.data) {
    out.bodyHtml = decodeBase64Url(part.body.data);
  }

  for (const sub of part.parts ?? []) {
    const subOut = extractBodies(sub);
    if (!out.bodyText && subOut.bodyText) out.bodyText = subOut.bodyText;
    if (!out.bodyHtml && subOut.bodyHtml) out.bodyHtml = subOut.bodyHtml;
  }
  return out;
}

/** Recursively walk and collect attachments (parts with body.attachmentId). */
function extractAttachments(part: gmail_v1.Schema$MessagePart): ParsedAttachment[] {
  const out: ParsedAttachment[] = [];
  if (part.body?.attachmentId) {
    out.push({
      gmailAttachmentId: part.body.attachmentId,
      filename: part.filename || "(unnamed)",
      mimeType: part.mimeType ?? undefined,
      sizeBytes: part.body.size ?? undefined,
    });
  }
  for (const sub of part.parts ?? []) {
    out.push(...extractAttachments(sub));
  }
  return out;
}

/**
 * Parse a raw Gmail message (format=full) into our DB-ready shape.
 * Pure -- no API calls, no DB. Defensive against missing fields.
 */
export function parseMessage(raw: gmail_v1.Schema$Message): ParsedMessage {
  if (!raw.id) throw new Error("parseMessage: missing message id");
  if (!raw.threadId) throw new Error("parseMessage: missing thread id");

  const labels = raw.labelIds ?? [];
  const direction: "inbound" | "outbound" = labels.includes("SENT") ? "outbound" : "inbound";

  const fromRaw = getHeader(raw, "From");
  const { email: fromEmail, name: fromName } = parseFromHeader(fromRaw);

  const toEmails = parseAddressList(getHeader(raw, "To"));
  const ccEmails = parseAddressList(getHeader(raw, "Cc"));
  const bccEmails = parseAddressList(getHeader(raw, "Bcc"));

  const subject = getHeader(raw, "Subject");
  const messageIdHeader = getHeader(raw, "Message-ID") ?? getHeader(raw, "Message-Id");
  const inReplyToHeader = getHeader(raw, "In-Reply-To");
  const referencesHeader = getHeader(raw, "References");

  // sent_at: prefer internalDate (ms since epoch), fall back to Date header
  let sentAt = new Date();
  if (raw.internalDate) {
    sentAt = new Date(Number(raw.internalDate));
  } else {
    const dateHeader = getHeader(raw, "Date");
    if (dateHeader) {
      const parsed = new Date(dateHeader);
      if (!isNaN(parsed.getTime())) sentAt = parsed;
    }
  }

  const bodies = raw.payload ? extractBodies(raw.payload) : {};
  const attachments = raw.payload ? extractAttachments(raw.payload) : [];

  return {
    gmailMessageId: raw.id,
    gmailHistoryId: raw.historyId ?? undefined,
    gmailThreadId: raw.threadId,
    messageIdHeader,
    inReplyToHeader,
    referencesHeader,
    fromEmail,
    fromName,
    toEmails,
    ccEmails,
    bccEmails,
    subject,
    bodyText: bodies.bodyText,
    bodyHtml: bodies.bodyHtml,
    snippet: raw.snippet ?? undefined,
    direction,
    sentAt,
    labels,
    isUnread: labels.includes("UNREAD"),
    isStarred: labels.includes("STARRED"),
    hasAttachments: attachments.length > 0,
    rawSize: raw.sizeEstimate ?? undefined,
    attachments,
  };
}

/** Thin wrapper that fetches + parses in one call. */
export async function fetchMessage(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<ParsedMessage> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return parseMessage(response.data);
}
