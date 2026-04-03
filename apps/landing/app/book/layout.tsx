import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book a Call",
  description:
    "Book a free 30-minute consultation with strvx. No pitch, just an honest conversation about your AI and automation needs.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
