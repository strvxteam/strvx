import { Sidebar } from "@/components/layout/sidebar";
import { RealtimeProvider } from "@/components/layout/realtime-provider";
import { CommandPalette } from "@/components/command-palette";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-14 md:px-8 md:pt-6">{children}</main>
      </div>
      <CommandPalette />
      <Toaster />
    </RealtimeProvider>
  );
}
