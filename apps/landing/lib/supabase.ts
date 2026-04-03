import { createClient } from "@supabase/supabase-js";

// Server-side only — uses service role key, never expose to client
// Fallback strings prevent build-time crashes; real values must be set in env
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  { auth: { persistSession: false } }
);

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  google_refresh_token: string | null;
  calendar_id: string;
  is_active: boolean;
  created_at: string;
};

export type Booking = {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  client_company: string | null;
  service_type: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  google_event_ids: { member_id: string; event_id: string }[];
  meet_link: string | null;
  notes: string | null;
  notes_summary: string | null;
  notes_action_items: string[] | null;
  reminder_sent_24h: boolean;
  reminder_sent_1h: boolean;
  created_at: string;
};
