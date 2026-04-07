import {
  INVOICE_STATUS_COLORS,
  RECONCILIATION_LABELS,
  type Invoice,
} from "@/lib/mock-finance";

interface InvoiceDocumentViewProps {
  invoice: Invoice & { clientEmail?: string; notes?: string };
  reconciliation?: {
    status: string;
    stripeAmount?: string;
    mercuryAmount?: string;
    matchedAt?: string;
  } | null;
}

export function InvoiceDocumentView({
  invoice,
  reconciliation,
}: InvoiceDocumentViewProps) {
  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const tax = Math.round(subtotal * 0.0875 * 100) / 100;
  const total = subtotal + tax;

  const recLabel = reconciliation?.status
    ? RECONCILIATION_LABELS[reconciliation.status]
    : null;

  return (
    <div>
      {/* Invoice Document */}
      <div className="mx-auto max-w-2xl rounded-lg border border-[#e0e0e0] bg-white p-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#222]">strvx</h1>
            <p className="text-[12px] text-[#888]">hello@strvx.com</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <h2 className="text-lg font-semibold text-[#222]">
                {invoice.number}
              </h2>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${INVOICE_STATUS_COLORS[invoice.status]}`}
              >
                {invoice.status}
              </span>
            </div>
          </div>
        </div>

        {/* Bill to + dates */}
        <div className="mb-8 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Bill To
            </p>
            <p className="mt-1 text-[13px] font-medium text-[#222]">
              {invoice.client}
            </p>
            {invoice.clientEmail && (
              <p className="text-[12px] text-[#888]">{invoice.clientEmail}</p>
            )}
          </div>
          <div className="text-right">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Issue Date
                </p>
                <p className="mt-1 text-[13px] text-[#222]">{invoice.date}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                  Due Date
                </p>
                <p className="mt-1 text-[13px] text-[#222]">
                  {invoice.dueDate}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="mb-4 w-full">
          <thead>
            <tr className="border-b border-[#e0e0e0]">
              <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Description
              </th>
              <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Qty
              </th>
              <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Rate
              </th>
              <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr
                key={li.id}
                className="border-b border-[#f0f0f0] transition-colors hover:bg-[#fafafa]"
              >
                <td className="px-2 py-2.5 text-[13px] text-[#222]">
                  {li.description}
                </td>
                <td className="px-2 py-2.5 text-right text-[13px] text-[#555]">
                  {li.quantity}
                </td>
                <td className="px-2 py-2.5 text-right text-[13px] text-[#555]">
                  ${li.rate.toFixed(2)}
                </td>
                <td className="px-2 py-2.5 text-right text-[13px] font-medium text-[#222]">
                  ${li.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between border-b border-[#f0f0f0] py-2">
              <span className="text-[13px] text-[#888]">Subtotal</span>
              <span className="text-[13px] text-[#222]">
                ${subtotal.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#f0f0f0] py-2">
              <span className="text-[13px] text-[#888]">Tax (8.75%)</span>
              <span className="text-[13px] text-[#222]">
                ${tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[14px] font-semibold text-[#222]">
                Total
              </span>
              <span className="text-[14px] font-semibold text-[#222]">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Paid banner */}
        {invoice.paidDate && (
          <div className="mt-6 rounded border border-[#e8f5e9] bg-[#e8f5e9] px-4 py-3">
            <p className="text-[13px] font-medium text-[#27ae60]">
              Paid on {invoice.paidDate}
            </p>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="mt-6 border-t border-[#f0f0f0] pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
              Notes
            </p>
            <p className="mt-1 text-[13px] text-[#555]">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 border-t border-[#f0f0f0] pt-4 text-center">
          <p className="text-[11px] text-[#bbb]">
            strvx &middot; hello@strvx.com &middot; Thank you for your business
          </p>
        </div>
      </div>

      {/* Reconciliation bar */}
      {reconciliation && (
        <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-[#e0e0e0] bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">
                Reconciliation
              </span>
              {recLabel && (
                <span className={`text-[12px] font-medium ${recLabel.color}`}>
                  {recLabel.text}
                </span>
              )}
            </div>
            <div className="flex items-center gap-6 text-[12px] text-[#555]">
              {reconciliation.stripeAmount && (
                <span>
                  Stripe: ${Number(reconciliation.stripeAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
              {reconciliation.mercuryAmount && (
                <span>
                  Mercury: ${Number(reconciliation.mercuryAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
              {reconciliation.matchedAt && (
                <span className="text-[#bbb]">
                  Matched {new Date(reconciliation.matchedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
