import type { DisconnectedMailbox } from "./_disconnect-check";

export function DisconnectBanner({
  mailboxes,
}: {
  mailboxes: DisconnectedMailbox[];
}) {
  if (mailboxes.length === 0) return null;
  return (
    <div
      style={{
        background: "#fef3c7",
        borderBottom: "1px solid #fcd34d",
        color: "#78350f",
        fontSize: 13,
        padding: "8px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {mailboxes.length === 1
          ? "Mailbox disconnected"
          : `${mailboxes.length} mailboxes disconnected`}
      </span>
      <span>—</span>
      <span>
        {mailboxes.map((mb, i) => (
          <span key={mb.id}>
            {i > 0 ? ", " : ""}
            <span style={{ fontWeight: 600 }}>{mb.email}</span>
          </span>
        ))}{" "}
        needs to reconnect.
      </span>
      <a
        href="/agent/connect-mailbox"
        style={{
          marginLeft: "auto",
          background: "#92400e",
          color: "#fffbeb",
          padding: "4px 10px",
          borderRadius: 4,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Reconnect →
      </a>
    </div>
  );
}
