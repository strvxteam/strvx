import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail } from "@/lib/queries";
import { getDriveFolderTree, createDriveFolder } from "@/lib/google-drive";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await getUserByEmail(user.email);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const folders = await getDriveFolderTree(dbUser.id);
    return NextResponse.json({ folders });
  } catch (error) {
    console.error("[Drive API] Failed to get folder tree:", error);
    return NextResponse.json({ error: "Failed to get folders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await getUserByEmail(user.email);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }

  try {
    const folder = await createDriveFolder(dbUser.id, name, body.parentId || undefined);
    if (!folder) {
      return NextResponse.json({ error: "Drive not connected" }, { status: 403 });
    }
    return NextResponse.json({ folder });
  } catch (error) {
    console.error("[Drive API] Failed to create folder:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
