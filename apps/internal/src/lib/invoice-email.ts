import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface InvoiceEmailData {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  taxRate: number;
  issuedDate: string;
  dueDate: string;
  lineItems: { description: string; quantity: number; rate: number; amount: number }[];
  notes?: string | null;
  stripePaymentUrl?: string | null;
}

function buildInvoiceHtml(data: InvoiceEmailData): string {
  const taxAmount = data.amount * (data.taxRate / 100);
  const total = data.amount + taxAmount;

  const lineItemRows = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #333;">${item.description}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #555; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #555; text-align: right;">$${item.rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #222; text-align: right; font-weight: 500;">$${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>`
    )
    .join("");

  const payButton = data.stripePaymentUrl
    ? `<div style="text-align: center; margin: 24px 0;">
        <a href="${data.stripePaymentUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">Pay Now</a>
      </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
    <div style="background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e0e0e0;">
      <!-- Header -->
      <div style="padding: 28px 32px; border-bottom: 1px solid #f0f0f0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 18px; font-weight: 700; color: #111; letter-spacing: -0.5px;">strvx</span>
          <span style="font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 1px;">Invoice</span>
        </div>
      </div>

      <!-- Invoice info -->
      <div style="padding: 24px 32px;">
        <table style="width: 100%; margin-bottom: 24px;">
          <tr>
            <td style="vertical-align: top;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Bill to</p>
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #222;">${data.clientName}</p>
              <p style="margin: 2px 0 0; font-size: 13px; color: #555;">${data.clientEmail}</p>
            </td>
            <td style="vertical-align: top; text-align: right;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #888;">${data.invoiceNumber}</p>
              <p style="margin: 0; font-size: 13px; color: #555;">Issued: ${data.issuedDate}</p>
              <p style="margin: 2px 0 0; font-size: 13px; color: #555;">Due: ${data.dueDate}</p>
            </td>
          </tr>
        </table>

        <!-- Line items -->
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #e0e0e0;">
              <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
              <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Qty</th>
              <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Rate</th>
              <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Amount</th>
            </tr>
          </thead>
          <tbody>${lineItemRows}</tbody>
        </table>

        <!-- Totals -->
        <div style="margin-top: 16px; text-align: right;">
          <p style="margin: 4px 0; font-size: 13px; color: #555;">Subtotal: $${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          ${data.taxRate > 0 ? `<p style="margin: 4px 0; font-size: 13px; color: #555;">Tax (${data.taxRate}%): $${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>` : ""}
          <p style="margin: 8px 0 0; font-size: 18px; font-weight: 700; color: #111;">Total: $${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>

        ${payButton}

        ${data.notes ? `<div style="margin-top: 20px; padding: 12px 16px; background: #f9f9f9; border-radius: 8px; font-size: 13px; color: #555;">${data.notes}</div>` : ""}
      </div>

      <!-- Footer -->
      <div style="padding: 16px 32px; border-top: 1px solid #f0f0f0; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #aaa;">strvx &middot; San Diego, CA &middot; strvxteam@gmail.com</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendInvoiceEmail(data: InvoiceEmailData) {
  const html = buildInvoiceHtml(data);

  const taxAmount = data.amount * (data.taxRate / 100);
  const total = data.amount + taxAmount;

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "strvx <invoices@strvx.com>",
    to: [data.clientEmail],
    subject: `Invoice ${data.invoiceNumber} — $${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    html,
  });

  return result;
}
