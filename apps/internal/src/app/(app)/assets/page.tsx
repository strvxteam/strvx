import AssetsPage from "./assets-client";

export const metadata = { title: "Assets" };

export default function AssetsServerPage() {
  return (
    <div className="fixed inset-0 left-[var(--sidebar-width,0px)] flex flex-col md:left-[220px]">
      <div className="flex-1 overflow-hidden px-4 pt-14 md:px-8 md:pt-6">
        <AssetsPage />
      </div>
    </div>
  );
}
