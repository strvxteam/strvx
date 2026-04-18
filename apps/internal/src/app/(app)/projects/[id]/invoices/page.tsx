export default async function ProjectInvoicesTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Projects link to invoices via engagementId; no direct projectId on invoices.
  // Stub for now: show empty state unless a future schema migration adds the link.
  void id;
  return (
    <p className="text-[13px] text-[#888]">
      Invoices are engagement-scoped. View them under the engagement detail.
    </p>
  );
}
