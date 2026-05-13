import { OAuth2Client } from "google-auth-library";

const authClient = new OAuth2Client();

/**
 * Pulls the JWT out of an `Authorization: Bearer <token>` header.
 */
export function parseAuthHeaderToken(header: string | null): string | null {
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies a Pub/Sub push JWT against Google's public JWKS.
 *
 * Checks:
 *   - signature valid for current Google certs
 *   - issuer = accounts.google.com (or https://accounts.google.com)
 *   - audience matches expectedAudience (the webhook URL)
 *   - email_verified === true
 *   - email matches expectedServiceAccount
 *
 * Throws on any failure. Caller should treat any throw as 401.
 */
export async function verifyPubsubJwt(opts: {
  token: string;
  expectedAudience: string;
  expectedServiceAccount: string;
}): Promise<void> {
  const ticket = await authClient.verifyIdToken({
    idToken: opts.token,
    audience: opts.expectedAudience,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("verifyIdToken returned no payload");

  if (
    payload.iss !== "accounts.google.com" &&
    payload.iss !== "https://accounts.google.com"
  ) {
    throw new Error(`Bad iss: ${payload.iss}`);
  }

  if (payload.email_verified !== true) {
    throw new Error("email_verified is not true");
  }

  if (payload.email !== opts.expectedServiceAccount) {
    throw new Error(
      `Bad service account: ${payload.email} (expected ${opts.expectedServiceAccount})`
    );
  }
}

export type PubsubPushEnvelope = {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
};

export type DecodedGmailPushPayload = {
  emailAddress: string;
  historyId: string;
};

/**
 * Decodes the base64 inner payload of a Pub/Sub push.
 * For Gmail watch events, the inner JSON is { emailAddress, historyId }.
 */
export function decodePubsubPushPayload(
  envelope: PubsubPushEnvelope
): DecodedGmailPushPayload {
  if (!envelope.message?.data) {
    throw new Error("Pub/Sub envelope missing message.data");
  }
  let json: string;
  try {
    json = Buffer.from(envelope.message.data, "base64").toString("utf8");
  } catch {
    throw new Error("Pub/Sub message.data is not valid base64");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Pub/Sub inner payload is not valid JSON");
  }
  const p = parsed as Partial<DecodedGmailPushPayload>;
  if (typeof p.emailAddress !== "string" || typeof p.historyId !== "string") {
    throw new Error("Pub/Sub inner payload missing emailAddress/historyId");
  }
  return { emailAddress: p.emailAddress, historyId: p.historyId };
}
