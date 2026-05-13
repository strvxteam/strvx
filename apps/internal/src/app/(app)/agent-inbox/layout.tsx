import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommandPalette } from "@/components/agent/command-palette";
import { fetchDisconnectedMailboxes } from "../_disconnect-check";
import { DisconnectBanner } from "../_disconnect-banner";

/**
 * Admin layout for /agent-inbox. Restricts to authenticated @strvx.com.
 * Inherits sidebar/topbar from the parent (app) layout.
 *
 * The parent (app) layout wraps children in:
 *   <main className="flex-1 overflow-y-auto px-4 pb-24 pt-14 md:px-8 md:pt-6">
 * We negate that padding so the 3-pane inbox fills the viewport edge-to-edge.
 */
export default async function AgentInboxLayout({
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

  // Negate the (app) layout's padding (px-4 pb-24 pt-14 md:px-8 md:pt-6)
  // so the 3-pane inbox fills the available space flush to edges.
  return (
    <div className="-mx-4 -mb-24 -mt-14 flex flex-col h-[calc(100dvh-0px)] min-h-0 md:-mx-8 md:-mt-6">
      <DisconnectBanner mailboxes={disconnected} />
      <div className="flex min-h-0 flex-1">
        {children}
        <CommandPalette />
      </div>
    </div>
  );
}
