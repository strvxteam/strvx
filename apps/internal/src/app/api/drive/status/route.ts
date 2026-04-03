import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail } from "@/lib/queries";
import { isGoogleDriveConnected } from "@/lib/google-drive";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ connected: false });
  }

  const dbUser = await getUserByEmail(user.email);
  if (!dbUser) {
    return NextResponse.json({ connected: false });
  }

  const connected = await isGoogleDriveConnected(dbUser.id);
  return NextResponse.json({ connected });
}
