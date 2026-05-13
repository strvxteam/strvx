import type { gmail_v1 } from "googleapis";

export type BuildMimeInput = {
  fromEmail: string;
  fromName?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string[];
};

/**
 * Builds an RFC 5322 MIME message string. Plaintext-first; HTML body added
 * as multipart/alternative when bodyHtml is provided.
 *
 * Caller is responsible for base64url-encoding for Gmail API.
 */
export function buildMimeMessage(input: BuildMimeInput): string {
  const lines: string[] = [];

  const fromHeader = input.fromName
    ? `${input.fromName} <${input.fromEmail}>`
    : input.fromEmail;

  lines.push(`From: ${fromHeader}`);
  lines.push(`To: ${input.to.join(", ")}`);
  if (input.cc.length) lines.push(`Cc: ${input.cc.join(", ")}`);
  if (input.bcc.length) lines.push(`Bcc: ${input.bcc.join(", ")}`);
  lines.push(`Subject: ${input.subject}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references?.length) {
    lines.push(`References: ${input.references.join(" ")}`);
  }
  lines.push("MIME-Version: 1.0");

  if (input.bodyHtml) {
    const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(input.bodyText);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(input.bodyHtml);
    lines.push("");
    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(input.bodyText);
  }

  return lines.join("\r\n");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendInput = BuildMimeInput & {
  gmail: gmail_v1.Gmail;
  threadId?: string;
};

export type SendResult = {
  gmailMessageId: string;
  gmailThreadId: string;
};

export async function sendViaMailbox(input: SendInput): Promise<SendResult> {
  const mime = buildMimeMessage(input);
  const raw = base64UrlEncode(mime);

  const response = await input.gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: input.threadId,
    },
  });

  if (!response.data.id || !response.data.threadId) {
    throw new Error("gmail.users.messages.send returned no id/threadId");
  }

  return {
    gmailMessageId: response.data.id,
    gmailThreadId: response.data.threadId,
  };
}
