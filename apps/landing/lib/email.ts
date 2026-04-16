import { Resend } from "resend";
import { getMeetingDuration, getMeetingLabel } from "./meeting-types";

const resend = new Resend(process.env.RESEND_API_KEY ?? "placeholder");
const FROM_EMAIL = "bookings@strvx.com";
const TIMEZONE = "America/Los_Angeles";

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " Pacific";
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── ICS generator ─────────────────────────────────────────────────────────────

function toICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function generateICS(params: {
  uid: string;
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  organizerEmail: string;
  attendeeEmail: string;
  meetLink: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//strvx//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(params.startTime)}`,
    `DTEND:${toICSDate(params.endTime)}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, "\\n")}`,
    ...(params.meetLink ? [`LOCATION:${params.meetLink}`] : []),
    `ORGANIZER;CN=strvx:mailto:${params.organizerEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${params.attendeeEmail}:mailto:${params.attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// ── Confirmation to client ────────────────────────────────────────────────────

type ConfirmationData = {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  serviceType: string;
  startTime: string;
  endTime: string;
  teamMemberNames: string[];
  meetLink: string;
};

export async function sendConfirmationEmail(data: ConfirmationData) {
  const dateDisplay = formatDateTime(data.startTime);
  const endTimeDisplay = formatTime(data.endTime);
  const teamDisplay = data.teamMemberNames.join(", ");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#0a0a0a;padding:28px 40px;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">strvx</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;letter-spacing:-0.02em;">You're booked.</h1>
            <p style="margin:0 0 32px;font-size:15px;color:#666;">We'll see you soon, ${data.clientName}.</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;border-radius:6px;margin-bottom:28px;">
              <tr><td style="padding:24px 28px;">
                <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#999;letter-spacing:0.1em;text-transform:uppercase;">Booking details</p>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#666;width:100px;vertical-align:top;">What</td>
                    <td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">Discovery Call · 30 min</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#666;vertical-align:top;">When</td>
                    <td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${dateDisplay} – ${endTimeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#666;vertical-align:top;">With</td>
                    <td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${teamDisplay} from strvx</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td align="center">
                  <a href="${data.meetLink}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.04em;padding:13px 28px;border-radius:6px;">
                    Join Google Meet
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">You'll receive a reminder 24 hours before your call. If you need to reschedule, reply to this email.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #e5e5e5;">
            <p style="margin:0;font-size:12px;color:#bbb;">strvx · San Diego, CA · <a href="https://strvx.com" style="color:#bbb;">strvx.com</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const icsContent = generateICS({
    uid: `booking-${data.bookingId}@strvx.com`,
    summary: `Discovery Call with strvx`,
    description: `Your 30-minute discovery call with ${data.teamMemberNames.join(", ")} from strvx.\n\nJoin: ${data.meetLink}`,
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    organizerEmail: FROM_EMAIL,
    attendeeEmail: data.clientEmail,
    meetLink: data.meetLink,
  });

  await resend.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject: `Confirmed: Discovery Call with strvx — ${formatDateTime(data.startTime)}`,
    html,
    attachments: [
      {
        filename: "invite.ics",
        content: Buffer.from(icsContent).toString("base64"),
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  });
}

// ── Team notification ─────────────────────────────────────────────────────────

type TeamNotificationData = {
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  clientCompany?: string | null;
  clientNotes?: string | null;
  serviceType: string;
  startTime: string;
  endTime: string;
  meetLink: string;
};

export async function sendTeamNotification(memberEmails: string[], data: TeamNotificationData) {
  const dateDisplay = formatDateTime(data.startTime);
  const endTimeDisplay = formatTime(data.endTime);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 40px;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">strvx · New Booking</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 24px;font-size:20px;font-weight:700;color:#0a0a0a;">New discovery call booked</h1>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="padding:4px 0;font-size:13px;color:#666;width:110px;">Client</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${data.clientName}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#666;">Email</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;">${data.clientEmail}</td></tr>
            ${data.clientPhone ? `<tr><td style="padding:4px 0;font-size:13px;color:#666;">Phone</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;">${data.clientPhone}</td></tr>` : ""}
            ${data.clientCompany ? `<tr><td style="padding:4px 0;font-size:13px;color:#666;">Company</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;">${data.clientCompany}</td></tr>` : ""}
            <tr><td style="padding:4px 0;font-size:13px;color:#666;">When</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${dateDisplay} – ${endTimeDisplay}</td></tr>
          </table>
          ${data.clientNotes ? `<div style="margin-top:20px;padding:16px;background:#f5f5f5;border-radius:6px;"><p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#999;letter-spacing:0.08em;text-transform:uppercase;">Notes from client</p><p style="margin:0;font-size:13px;color:#0a0a0a;line-height:1.6;white-space:pre-wrap;">${data.clientNotes}</p></div>` : ""}
          <a href="${data.meetLink}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 24px;border-radius:6px;">Join Google Meet</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: memberEmails,
    subject: `New booking: ${data.clientName} — ${formatDateTime(data.startTime)}`,
    html,
  });
}

// ── Follow-up confirmation to client ──────────────────────────────────────────

type FollowUpConfirmationData = {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  meetingType: string; // "proposal" | "revision" | "in_person"
  startTime: string;
  endTime: string;
  meetLink: string;
};

export async function sendFollowUpConfirmation(data: FollowUpConfirmationData) {
  const dateDisplay = formatDateTime(data.startTime);
  const endTimeDisplay = formatTime(data.endTime);
  const typeLabel = getMeetingLabel(data.meetingType);
  const durationMinutes = getMeetingDuration(data.meetingType);
  const durationDisplay = durationMinutes >= 60
    ? `${durationMinutes / 60} hr`
    : `${durationMinutes} min`;
  const isInPerson = data.meetingType === "in_person";

  const icsContent = generateICS({
    uid: `followup-${data.bookingId}@strvx.com`,
    summary: `${typeLabel} with strvx`,
    description: isInPerson
      ? `Your ${durationDisplay} ${typeLabel.toLowerCase()} with strvx. We'll reach out with location details shortly.`
      : `Your ${durationDisplay} ${typeLabel.toLowerCase()} with strvx.\n\nJoin: ${data.meetLink}`,
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    organizerEmail: FROM_EMAIL,
    attendeeEmail: data.clientEmail,
    meetLink: data.meetLink,
  });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 40px;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">strvx</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;letter-spacing:-0.02em;">You're booked.</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#666;">See you soon, ${data.clientName}.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;border-radius:6px;margin-bottom:28px;">
            <tr><td style="padding:24px 28px;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#999;letter-spacing:0.1em;text-transform:uppercase;">Details</p>
              <table cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#666;width:100px;">What</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${typeLabel} · ${durationDisplay}</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#666;">When</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${dateDisplay} – ${endTimeDisplay}</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#666;">With</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">strvx team</td></tr>
              </table>
            </td></tr>
          </table>
          ${isInPerson
            ? `<p style="margin:0 0 24px;font-size:14px;color:#0a0a0a;line-height:1.6;">We'll reach out shortly with location details.</p>`
            : `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;"><tr><td align="center"><a href="${data.meetLink}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.04em;padding:13px 28px;border-radius:6px;">Join Google Meet</a></td></tr></table>`}
          <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">You'll receive a reminder before your call. If you need to reschedule, reply to this email.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#bbb;">strvx · San Diego, CA · <a href="https://strvx.com" style="color:#bbb;">strvx.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject: `Confirmed: ${typeLabel} with strvx — ${formatDateTime(data.startTime)}`,
    html,
    attachments: [
      {
        filename: "invite.ics",
        content: Buffer.from(icsContent).toString("base64"),
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  });
}

// ── Follow-up team notification ────────────────────────────────────────────────

type FollowUpTeamNotificationData = {
  clientName: string;
  clientEmail: string;
  clientCompany?: string | null;
  meetingType: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  notes?: string | null;
};

export async function sendFollowUpTeamNotification(data: FollowUpTeamNotificationData) {
  const dateDisplay = formatDateTime(data.startTime);
  const endTimeDisplay = formatTime(data.endTime);
  const typeLabel = getMeetingLabel(data.meetingType);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 40px;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">strvx · Follow-up Booked</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 24px;font-size:20px;font-weight:700;color:#0a0a0a;">New ${typeLabel.toLowerCase()} booked</h1>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="padding:4px 0;font-size:13px;color:#666;width:110px;">Client</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${data.clientName}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#666;">Email</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;">${data.clientEmail}</td></tr>
            ${data.clientCompany ? `<tr><td style="padding:4px 0;font-size:13px;color:#666;">Company</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;">${data.clientCompany}</td></tr>` : ""}
            <tr><td style="padding:4px 0;font-size:13px;color:#666;">Type</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${typeLabel}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#666;">When</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${dateDisplay} – ${endTimeDisplay}</td></tr>
          </table>
          ${data.notes ? `<div style="margin-bottom:24px;padding:16px;background:#f5f5f5;border-radius:6px;"><p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#999;letter-spacing:0.08em;text-transform:uppercase;">Notes</p><p style="margin:0;font-size:13px;color:#0a0a0a;line-height:1.6;white-space:pre-wrap;">${data.notes}</p></div>` : ""}
          ${data.meetingType === "in_person"
            ? `<p style="margin:0;font-size:13px;color:#0a0a0a;">In-person meeting — no Meet link.</p>`
            : `<a href="${data.meetLink}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:12px 24px;border-radius:6px;">Join Google Meet</a>`}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: "team@strvx.com",
    subject: `${typeLabel}: ${data.clientName} — ${formatDateTime(data.startTime)}`,
    html,
  });
}

// ── Reminders ─────────────────────────────────────────────────────────────────

type ReminderData = {
  clientName: string;
  clientEmail: string;
  startTime: string;
  endTime: string;
  teamMemberNames: string[];
  meetLink: string;
  serviceType: string;
};

export async function sendReminderEmail(data: ReminderData, type: "24h" | "1h") {
  const dateDisplay = formatDateTime(data.startTime);
  const endTimeDisplay = formatTime(data.endTime);
  const teamDisplay = data.teamMemberNames.join(", ");
  const timeContext = type === "24h" ? "tomorrow" : "in 1 hour";
  const typeLabel = data.serviceType === "discovery"
    ? "Discovery Call"
    : getMeetingLabel(data.serviceType);
  const durationMinutes = getMeetingDuration(data.serviceType);
  const durationDisplay = durationMinutes >= 60
    ? `${durationMinutes / 60} hr`
    : `${durationMinutes} min`;
  const isInPerson = data.serviceType === "in_person";
  const subject =
    type === "24h"
      ? `Reminder: Your ${typeLabel.toLowerCase()} with strvx is tomorrow`
      : `Your strvx ${typeLabel.toLowerCase()} starts in 1 hour`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 40px;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">strvx</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a0a0a;">Your ${isInPerson ? "meeting" : "call"} is ${timeContext}.</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#666;">Here are your details, ${data.clientName}.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;border-radius:6px;margin-bottom:28px;">
            <tr><td style="padding:24px 28px;">
              <table cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#666;width:100px;">What</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${typeLabel} · ${durationDisplay}</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#666;">When</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${dateDisplay} – ${endTimeDisplay}</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#666;">With</td><td style="padding:4px 0;font-size:13px;color:#0a0a0a;font-weight:500;">${teamDisplay} from strvx</td></tr>
              </table>
            </td></tr>
          </table>

          ${isInPerson || !data.meetLink
            ? `<p style="margin:0;font-size:13px;color:#0a0a0a;">We'll reach out with location details if we haven't already.</p>`
            : `<a href="${data.meetLink}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:13px 28px;border-radius:6px;">Join Google Meet</a>`}

          <p style="margin:24px 0 0;font-size:13px;color:#999;">Questions? Reply to this email.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:12px;color:#bbb;">strvx · <a href="https://strvx.com" style="color:#bbb;">strvx.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: data.clientEmail,
    subject,
    html,
  });
}
