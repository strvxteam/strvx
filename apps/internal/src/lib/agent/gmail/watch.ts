import type { gmail_v1 } from "googleapis";

/**
 * Sets up a Gmail watch for a connected mailbox.
 *
 * Tells Gmail to publish history changes (INBOX + SENT) to the configured
 * Pub/Sub topic. Returns the historyId cursor and the watch expiration time
 * (Gmail watches expire every 7 days; we renew daily via cron).
 *
 * Pure-ish: takes a constructed gmail client so it can be tested with a mock.
 */
export type SetupWatchInput = {
  gmail: gmail_v1.Gmail;
  mailboxId: string;
};

export type SetupWatchResult = {
  historyId: string;
  expiration: Date;
};

export async function setupGmailWatch(
  input: SetupWatchInput
): Promise<SetupWatchResult> {
  const topic = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topic) {
    throw new Error("GOOGLE_PUBSUB_TOPIC env var not set");
  }
  const response = await input.gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: topic,
      labelIds: ["INBOX", "SENT"],
      labelFilterBehavior: "INCLUDE",
    },
  });

  const historyId = response.data.historyId;
  const expirationStr = response.data.expiration;

  if (!historyId) {
    throw new Error("gmail.users.watch returned no historyId");
  }
  if (!expirationStr) {
    throw new Error("gmail.users.watch returned no expiration");
  }

  return {
    historyId,
    expiration: new Date(Number(expirationStr)),
  };
}

/**
 * Renew an existing watch. Same call shape as setup — Gmail watch operates
 * on the authed user. Re-calling watch returns a new historyId + expiration.
 */
export async function renewGmailWatch(
  input: SetupWatchInput
): Promise<SetupWatchResult> {
  return setupGmailWatch(input);
}
