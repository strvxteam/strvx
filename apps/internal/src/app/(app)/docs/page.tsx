import { getDocuments } from "@/lib/queries";
import { DocsTable } from "@/components/docs/docs-table";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata = { title: "Docs" };

export default async function DocsPage() {
  const [dbDocs, allUsers] = await Promise.all([
    getDocuments(),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);

  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const docs = dbDocs.map((d) => ({
    id: d.id,
    title: d.title,
    contentText: d.contentText,
    authorId: d.authorId,
    authorName: d.authorId ? userMap.get(d.authorId) ?? null : null,
    updatedAt: d.updatedAt.toISOString(),
  }));

  return <DocsTable docs={docs} />;
}
