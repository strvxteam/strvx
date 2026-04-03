export type MarketingPlatform = "linkedin" | "nextdoor" | "x";

export type PostStatus = "published" | "scheduled" | "draft";

export interface MarketingPost {
  id: string;
  platform: MarketingPlatform;
  title: string;
  content: string;
  date: string;
  status: PostStatus;
}

let nextId = 20;
export function generateId(): string {
  return `post-${nextId++}`;
}

export const initialPosts: MarketingPost[] = [
  {
    id: "post-1",
    platform: "linkedin",
    title: "How We Helped a Local Business 3x Their Online Presence",
    content:
      "Case study breakdown of our work with a local restaurant chain. We rebuilt their site, optimized SEO, and ran targeted LinkedIn campaigns.",
    date: "2026-03-28",
    status: "published",
  },
  {
    id: "post-2",
    platform: "linkedin",
    title: "5 Web Design Trends Small Businesses Should Know in 2026",
    content:
      "The web design landscape is shifting fast. Here are 5 trends every small business owner should know about.",
    date: "2026-03-25",
    status: "published",
  },
  {
    id: "post-3",
    platform: "nextdoor",
    title: "Free Website Audit for Local Businesses This Month",
    content:
      "Hey neighbors! We're offering free website audits this month. DM us or visit our site to book.",
    date: "2026-03-27",
    status: "published",
  },
  {
    id: "post-4",
    platform: "linkedin",
    title: "Case Study: Summit Retail E-Commerce Launch",
    content:
      "How we built and launched Summit Retail's new e-commerce platform in 8 weeks.",
    date: "2026-04-01",
    status: "scheduled",
  },
  {
    id: "post-5",
    platform: "nextdoor",
    title: "Meet the Team Behind STRVX — Your Neighborhood Dev Shop",
    content:
      "We're a small team of developers and designers right here in your neighborhood. Here's who we are.",
    date: "2026-03-22",
    status: "published",
  },
  {
    id: "post-6",
    platform: "nextdoor",
    title: "Spring Special: Landing Page Build for $999",
    content:
      "Spring is here and so is our landing page special. Perfect for local businesses looking to get online fast.",
    date: "2026-04-03",
    status: "draft",
  },
  {
    id: "post-7",
    platform: "linkedin",
    title: "Why We Chose Next.js for Our Client Projects",
    content:
      "After evaluating several frameworks, here's why Next.js won for our agency and our clients.",
    date: "2026-03-20",
    status: "published",
  },
  {
    id: "post-8",
    platform: "linkedin",
    title: "The ROI of Good Design: Numbers Don't Lie",
    content:
      "We tracked conversion rates before and after redesigns for 12 clients. The results speak for themselves.",
    date: "2026-03-15",
    status: "published",
  },
  {
    id: "post-9",
    platform: "nextdoor",
    title: "We Just Launched Dr. Bob's New Website — Check It Out!",
    content:
      "Proud to share the new site we built for Dr. Bob Nelson, executive speaker and author.",
    date: "2026-03-18",
    status: "published",
  },
  {
    id: "post-10",
    platform: "x",
    title: "Thread: How we debug production issues at 2am",
    content:
      "1/ Production goes down. Your phone buzzes. Here's our playbook for getting things back up fast.",
    date: "2026-03-26",
    status: "draft",
  },
  {
    id: "post-11",
    platform: "x",
    title: "AI agents are the new junior devs. Here's what we're seeing.",
    content:
      "We've been using AI agents in production for 3 months now. The good, the bad, and the surprisingly useful.",
    date: "2026-03-29",
    status: "scheduled",
  },
  {
    id: "post-12",
    platform: "x",
    title: "Hot take: Most agency websites are worse than their clients'",
    content:
      "The cobbler's children have no shoes. We rebuilt ours from scratch last month. Here's what changed.",
    date: "2026-03-24",
    status: "published",
  },
  {
    id: "post-13",
    platform: "x",
    title: "Shipped a full e-commerce platform in 8 weeks. AMA.",
    content:
      "Summit Retail needed to go live before Q2. We pulled it off. Ask us anything about the build.",
    date: "2026-04-02",
    status: "draft",
  },
];

export const platformConfig: Record<
  MarketingPlatform,
  { label: string; color: string; bg: string; border: string }
> = {
  linkedin: {
    label: "LinkedIn",
    color: "text-[#0a66c2]",
    bg: "bg-[#e8f1fa]",
    border: "border-[#0a66c2]",
  },
  nextdoor: {
    label: "Nextdoor",
    color: "text-[#8ed500]",
    bg: "bg-[#f3fae0]",
    border: "border-[#8ed500]",
  },
  x: {
    label: "X",
    color: "text-[#000]",
    bg: "bg-[#f5f5f5]",
    border: "border-[#000]",
  },
};

export const statusStyles: Record<PostStatus, string> = {
  published: "bg-[#e6f9e6] text-[#1a7a1a]",
  scheduled: "bg-[#e8f0fe] text-[#1a73e8]",
  draft: "bg-[#f5f5f5] text-[#888]",
};
