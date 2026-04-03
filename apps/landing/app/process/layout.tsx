import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Process",
  description:
    "From discovery to delivery in weeks. Our 5-step process: Discovery, MVP, Build, Deliver, Maintain. Clear scope, no surprises.",
};

export default function ProcessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
