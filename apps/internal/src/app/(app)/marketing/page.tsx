import MarketingPage from "./marketing-client";
import type { MarketingPost } from "@/lib/mock-marketing";
import { getMarketingPosts } from "@/lib/queries";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Marketing" };

export default async function MarketingServerPage() {
  const realPosts = await getMarketingPosts();
  const initialPosts: MarketingPost[] = realPosts.map((p) => ({
    id: p.id,
    platform: p.platform as MarketingPost["platform"],
    title: p.title,
    content: p.content || "",
    date: p.scheduledAt
      ? new Date(p.scheduledAt).toISOString().split("T")[0]
      : new Date(p.createdAt).toISOString().split("T")[0],
    status: p.status as MarketingPost["status"],
  }));

  return <MarketingPage initialPosts={initialPosts} />;
}
