import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Client Portal — strvx", template: "%s — strvx Portal" },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <header className="border-b border-[#e0e0e0] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-base font-bold tracking-tight text-[#111]">strvx</span>
          <span className="text-[12px] font-medium text-[#888]">Client Portal</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
