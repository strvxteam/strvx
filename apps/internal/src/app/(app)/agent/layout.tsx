import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommandPalette } from "@/components/agent/command-palette";
import { fetchDisconnectedMailboxes } from "../_disconnect-check";
import { DisconnectBanner } from "../_disconnect-banner";

/**
 * Admin gate for /agent/* pages. Restricts to authenticated @strvx.com.
 * Inherits sidebar/topbar from the parent (app) layout.
 */
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email?.endsWith("@strvx.com")) {
    redirect("/login");
  }

  const disconnected = await fetchDisconnectedMailboxes();

  return (
    <>
      <DisconnectBanner mailboxes={disconnected} />
      {children}
      <CommandPalette />
    </>
  );
}
