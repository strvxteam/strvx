import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail } from "@/lib/queries";
import { listDriveFiles, uploadDriveFile, moveDriveFile } from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await getUserByEmail(user.email);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const folderId = request.nextUrl.searchParams.get("folderId") || undefined;
  const pageToken = request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const result = await listDriveFiles(dbUser.id, folderId, pageToken);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Drive API] Failed to list files:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const parentId = formData.get("parentId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadDriveFile(
      dbUser.id,
      { name: file.name, mimeType: file.type || "application/octet-stream", body: buffer },
      parentId || undefined,
    );
    if (!result) {
      return NextResponse.json({ error: "Drive not connected" }, { status: 403 });
    }
    return NextResponse.json({ file: result });
  } catch (error) {
    console.error("[Drive API] Failed to upload file:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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
  const { fileId, newParentId } = body;

  if (!fileId || !newParentId) {
    return NextResponse.json({ error: "fileId and newParentId are required" }, { status: 400 });
  }

  try {
    const success = await moveDriveFile(dbUser.id, fileId, newParentId);
    if (!success) {
      return NextResponse.json({ error: "Drive not connected" }, { status: 403 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Drive API] Failed to move file:", error);
    return NextResponse.json({ error: "Failed to move file" }, { status: 500 });
  }
}
