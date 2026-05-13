import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin gate for /agent/* pages. Restricts to authenticated @strvx.com.
 * Inherits sidebar/topbar from the parent (app) layout.
 *
 * Note: the source repo also renders a CommandPalette + DisconnectBanner here.
 * Those depend on components not yet ported to apps/internal — they'll be
 * added in a later slice when the agent inbox UI lands.
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

  return <>{children}</>;
}
