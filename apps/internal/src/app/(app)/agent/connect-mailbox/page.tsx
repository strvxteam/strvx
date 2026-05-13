import { desc } from "drizzle-orm";
import Link from "next/link";
import { db, mailboxOauthTokens } from "@strvx/db";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ connected?: string; error?: string }>;

export default async function ConnectMailboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const mailboxes = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
      displayName: mailboxOauthTokens.displayName,
      scopes: mailboxOauthTokens.scopes,
      isActive: mailboxOauthTokens.isActive,
      isPrimary: mailboxOauthTokens.isPrimary,
      createdAt: mailboxOauthTokens.createdAt,
      updatedAt: mailboxOauthTokens.updatedAt,
    })
    .from(mailboxOauthTokens)
    .orderBy(desc(mailboxOauthTokens.createdAt));

  return (
    <div style={{ maxWidth: 768, padding: "40px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 4 }}>
        Connect mailbox
      </h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 32 }}>
        Authorize a Gmail mailbox for the agent. The agent will read incoming mail
        and draft replies. No mail is sent without explicit human approval.
      </p>

      {params.connected && (
        <div
          style={{
            marginBottom: 24,
            borderRadius: 6,
            border: "1px solid #27ae60",
            background: "#e8f5e9",
            color: "#1b5e20",
            padding: "12px 16px",
            fontSize: 13,
          }}
        >
          Connected: {params.connected}
        </div>
      )}

      {params.error && (
        <div
          style={{
            marginBottom: 24,
            borderRadius: 6,
            border: "1px solid #e74c3c",
            background: "#fde8e8",
            color: "#7c1c14",
            padding: "12px 16px",
            fontSize: 13,
          }}
        >
          Error: {params.error}
        </div>
      )}

      <Link
        href="/api/auth/google/mailbox?return_to=/agent/connect-mailbox"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 6,
          border: "1px solid #e0e0e0",
          padding: "8px 16px",
          fontSize: 14,
          color: "#111",
          textDecoration: "none",
          background: "#fff",
        }}
      >
        Connect a new Gmail mailbox
      </Link>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 48, marginBottom: 12 }}>
        Connected mailboxes
      </h2>
      {mailboxes.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No mailboxes connected yet.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 0",
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#888",
                }}
              >
                Email
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 0",
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#888",
                }}
              >
                Scopes
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 0",
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#888",
                }}
              >
                Status
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 0",
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: "#888",
                }}
              >
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {mailboxes.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "12px 0" }}>
                  <div style={{ fontWeight: 500 }}>{m.email}</div>
                  {m.displayName && (
                    <div style={{ color: "#888", fontSize: 12 }}>{m.displayName}</div>
                  )}
                </td>
                <td style={{ padding: "12px 0", color: "#888" }}>
                  {m.scopes
                    .map((s) => s.replace("https://www.googleapis.com/auth/", ""))
                    .join(", ")}
                </td>
                <td style={{ padding: "12px 0" }}>{m.isActive ? "Active" : "Paused"}</td>
                <td style={{ padding: "12px 0", color: "#888" }}>
                  {new Date(m.updatedAt).toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
