export function getMeetingDuration(meetingType: string): number {
  if (meetingType === "in_person") return 120;
  // Internal meetings: client picks duration — 30 default if unspecified.
  return 30;
}

export const INTERNAL_DURATION_OPTIONS = [30, 45, 60] as const;
export type InternalDuration = (typeof INTERNAL_DURATION_OPTIONS)[number];

export function isInternalMeeting(meetingType: string): boolean {
  return meetingType === "internal";
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
    default:
      return "Meeting";
  }
}
