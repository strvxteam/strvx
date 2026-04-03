import { notFound } from "next/navigation";
import { getDocument } from "@/lib/queries";
import { DocEditor } from "@/components/docs/doc-editor";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail } from "@/lib/queries";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dbDoc = await getDocument(id);

  if (!dbDoc) {
    notFound();
  }

  let authorName: string | null = null;
  if (dbDoc.authorId) {
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, dbDoc.authorId));
    authorName = author?.name ?? null;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentUser = { id: "unknown", name: "Unknown" };
  if (user?.email) {
    const dbUser = await getUserByEmail(user.email);
    if (dbUser) {
      currentUser = { id: dbUser.id, name: dbUser.name };
    }
  }

  return (
    <DocEditor
      doc={{
        id: dbDoc.id,
        title: dbDoc.title,
        content: dbDoc.content as Record<string, unknown> | null,
        authorName,
        updatedAt: dbDoc.updatedAt.toISOString(),
      }}
      currentUser={currentUser}
    />
  );
}
