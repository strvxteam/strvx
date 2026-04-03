import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Services",
  description:
    "AI agents, strategy consulting, custom solutions, and full maintenance. We build and manage internal AI tools for businesses in San Diego.",
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
