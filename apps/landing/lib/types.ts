// TeamMember projection for booking/calendar logic
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  googleRefreshToken: string | null;
  calendarId: string | null;
  isActive: boolean;
};
