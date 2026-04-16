export function getMeetingDuration(meetingType: string): number {
  if (meetingType === "in_person") return 120;
  return 30;
}

export function getMeetingLabel(meetingType: string): string {
  switch (meetingType) {
    case "proposal":
      return "Proposal Call";
    case "revision":
      return "Revision Call";
    case "in_person":
      return "In-Person Meeting";
    default:
      return "Meeting";
  }
}
