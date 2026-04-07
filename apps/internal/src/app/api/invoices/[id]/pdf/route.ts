import { NextRequest, NextResponse } from "next/server";
import { getInvoice } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const lineItems = Array.isArray(invoice.lineItems)
    ? (invoice.lineItems as { id: string; description: string; quantity: number; rate: number; amount: number }[])
    : [];

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const taxRate = Number(invoice.taxRate ?? 0);
  const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + tax;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineItemRows = lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">${li.description}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; text-align: center;">${li.quantity}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; text-align: right;">$${fmt(li.rate)}</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; text-align: right; font-weight: 500;">$${fmt(li.amount)}</td>
      </tr>`
    )
    .join("");

  const paidSection = invoice.paidDate
    ? `<div style="margin-top: 24px; padding: 12px 16px; background: #e8f5e9; border-radius: 6px; font-size: 13px; color: #27ae60; font-weight: 500;">Paid on ${invoice.paidDate}</div>`
    : "";

  const notesSection = invoice.notes
    ? `<div style="margin-top: 24px; padding: 12px 16px; background: #f9f9f9; border-radius: 6px; font-size: 12px; color: #555;">${invoice.notes}</div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #222; background: #fff; margin: 0; padding: 40px; }
    .invoice { max-width: 680px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; padding: 8px 0; border-bottom: 2px solid #e0e0e0; }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 24px;">
    <button onclick="window.print()" style="padding: 8px 24px; background: #111; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">Save as PDF</button>
  </div>
  <div class="invoice">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
      <div>
        <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">strvx</div>
        <div style="font-size: 12px; color: #888; margin-top: 2px;">Digital Agency</div>
        <div style="font-size: 12px; color: #888;">San Diego, CA</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px;">Invoice</div>
        <div style="font-size: 15px; font-weight: 600;">${invoice.invoiceNumber}</div>
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
      <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 4px;">Bill To</div>
        <div style="font-size: 14px; font-weight: 500;">${invoice.clientName}</div>
        ${invoice.clientEmail ? `<div style="font-size: 12px; color: #888;">${invoice.clientEmail}</div>` : ""}
      </div>
      <div style="text-align: right; font-size: 13px;">
        <div><span style="color: #888;">Issued:</span> ${invoice.issuedDate ?? "—"}</div>
        <div style="margin-top: 2px;"><span style="color: #888;">Due:</span> ${invoice.dueDate ?? "—"}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${lineItemRows}</tbody>
    </table>
    <div style="text-align: right; margin-top: 16px;">
      <div style="font-size: 13px; color: #888; margin-bottom: 4px;">Subtotal: $${fmt(subtotal)}</div>
      ${taxRate > 0 ? `<div style="font-size: 13px; color: #888; margin-bottom: 4px;">Tax (${taxRate}%): $${fmt(tax)}</div>` : ""}
      <div style="font-size: 16px; font-weight: 700; border-top: 2px solid #222; display: inline-block; padding-top: 8px; margin-top: 4px;">Total: $${fmt(total)}</div>
    </div>
    ${paidSection}
    ${notesSection}
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #f0f0f0; text-align: center; font-size: 11px; color: #aaa;">
      strvx &middot; San Diego, CA &middot; strvxteam@gmail.com
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
