import { Sidebar } from "@/components/layout/sidebar";
import { SidebarBreadcrumbs } from "@/components/layout/sidebar-breadcrumbs";
import { RealtimeProvider } from "@/components/layout/realtime-provider";
import { Palette } from "@/components/palette/palette";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-14 md:px-8 md:pt-6">
          <SidebarBreadcrumbs />
          {children}
        </main>
      </div>
      <Palette />
      <Toaster />
    </RealtimeProvider>
  );
}
