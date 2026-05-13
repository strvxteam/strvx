/**
 * Local copy of the subset of ParsedMessage fields this prompt builder consumes.
 * The Gmail fetch helper that produces the full ParsedMessage type is wired in
 * a later slice; until then we keep the shape co-located here so callsites
 * (classify.ts) can construct it directly from email_messages rows.
 */
export type ClassificationParsedMessage = {
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
  attachments: Array<{
    gmailAttachmentId: string;
    filename: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
};

export type ClassificationPromptInput = {
  message: ClassificationParsedMessage;
  threadContext?: {
    priorMessageCount: number;
    threadSubject?: string;
    participants?: Array<{ email: string; name?: string; role?: string }>;
  };
  /**
   * Optional list of {id, name, primary_contact_email} from the CRM for the
   * model to suggest a related_engagement_id from. Pass empty array if none.
   */
  candidateEngagements?: Array<{
    id: string;
    name: string;
    company?: string;
    primaryContactEmail?: string;
  }>;
};

const SYSTEM_PROMPT = `You are a classifier for the strvx team's shared inbox.
Given one inbound email plus thread + CRM context, you output a strict
JSON object describing what it is and what should happen next.

CATEGORIES — pick exactly one:
  lead_inquiry        first contact from someone interested in working with strvx
  client_active       conversation with a current paying client about active work
  client_followup     conversation with a past or paused client (re-engagement, check-in)
  vendor              tool / service / contractor strvx pays
  personal            non-business: family, friends, individual life logistics
  newsletter          marketing, transactional updates, "no reply" senders, digests
  spam                obvious junk, phishing, irrelevant cold pitches
  calendar_invite     .ics or other meeting-invite payload
  scheduling_request  someone asking to find a time, propose slots, reschedule
  other               anything not fitting the above

URGENCY: urgent / normal / low.
  urgent = needs human attention today
  normal = within a couple business days
  low    = informational, no clock

INTENT: what is the sender actually asking us to do?
  reply_needed | schedule | reschedule | cancel | fyi | introduction | proposal_review | invoice_question | other

requires_reply: true ONLY if a human-quality reply is needed.
  Newsletters, FYI cc's, automated receipts → false.

suggested_workflow: none / draft_reply / propose_schedule / escalate.
  escalate when the email has high stakes (large $, legal, anger) — don't draft.

related_engagement_id / related_engagement_confidence / related_contact_id:
  Set ONLY if you find a strong match in the candidates list. Use null otherwise.
  Confidence "high" requires explicit signals (company name match + contact email match).

reasoning: one short sentence (max 200 chars) — why this classification.
  Voice: terse, lowercase-first, no filler.

Output strict JSON matching the schema. No prose outside the JSON.`;

export function buildClassificationPrompt(input: ClassificationPromptInput): {
  system: string;
  user: string;
} {
  const { message, threadContext, candidateEngagements } = input;

  const parts: string[] = [];
  parts.push("EMAIL:");
  parts.push(`From: ${message.fromEmail}${message.fromName ? ` (${message.fromName})` : ""}`);
  parts.push(`To: ${message.toEmails.join(", ") || "(none)"}`);
  if (message.ccEmails.length) parts.push(`Cc: ${message.ccEmails.join(", ")}`);
  parts.push(`Subject: ${message.subject ?? "(no subject)"}`);
  parts.push(`Direction: ${message.direction}`);
  parts.push(`Labels: ${message.labels.join(", ") || "(none)"}`);
  parts.push("");
  parts.push("BODY:");
  const body = (message.bodyText ?? message.snippet ?? "(no plain text body)").slice(0, 8000);
  parts.push(body);
  parts.push("");

  if (threadContext) {
    parts.push("THREAD CONTEXT:");
    parts.push(`Prior messages in thread: ${threadContext.priorMessageCount}`);
    if (threadContext.threadSubject && threadContext.threadSubject !== message.subject) {
      parts.push(`Original thread subject: ${threadContext.threadSubject}`);
    }
    if (threadContext.participants && threadContext.participants.length) {
      parts.push(
        `Participants: ${threadContext.participants
          .map((p) => p.email)
          .join(", ")}`
      );
    }
    parts.push("");
  }

  if (candidateEngagements && candidateEngagements.length) {
    parts.push("CRM CANDIDATE ENGAGEMENTS (consider for related_engagement_id):");
    for (const e of candidateEngagements) {
      parts.push(
        `- id=${e.id} name="${e.name}"${e.company ? ` company="${e.company}"` : ""}${e.primaryContactEmail ? ` primary=${e.primaryContactEmail}` : ""}`
      );
    }
    parts.push("");
  } else {
    parts.push("CRM CANDIDATE ENGAGEMENTS: (none provided — set related_engagement_id to null)");
    parts.push("");
  }

  parts.push("Classify the email above. Return strict JSON.");

  return { system: SYSTEM_PROMPT, user: parts.join("\n") };
}
