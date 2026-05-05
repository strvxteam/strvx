export function getMeetingDuration(meetingType: string): number {
  if (meetingType === "in_person") return 120;
  // Internal + partner meetings: client picks duration — 30 default if unspecified.
  return 30;
}

export const INTERNAL_DURATION_OPTIONS = [30, 45, 60] as const;
export type InternalDuration = (typeof INTERNAL_DURATION_OPTIONS)[number];

export function isInternalMeeting(meetingType: string): boolean {
  return meetingType === "internal";
}

// Partner meetings use the same booking UX as internal — duration picker,
// no engagement context, no prefill — but the partner is auto-added as a
// calendar attendee so they're invited to the call.
export function isPartnerMeeting(meetingType: string): boolean {
  return meetingType === "partner";
}

// Both internal and partner meetings let the booker pick duration.
export function isDurationPickerMeeting(meetingType: string): boolean {
  return meetingType === "internal" || meetingType === "partner";
}

export function getMeetingLabel(meetingType: string): string {
  switch (meetingType) {
    case "proposal":
      return "Proposal Call";
    case "revision":
      return "Revision Call";
    case "in_person":
      return "In-Person Meeting";
    case "internal":
      return "Internal Meeting";
    case "partner":
      return "Partner Meeting";
    default:
      return "Meeting";
  }
}
