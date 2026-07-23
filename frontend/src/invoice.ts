import dayjs from "dayjs";
import { Order } from "@/src/api";
import { translations, Lang } from "@/src/i18n";
import { computeTotals, lineNet, money } from "@/src/calc";

export type InvoiceContact = {
  pib?: string;
  phone?: string;
  address?: string;
  email?: string;
};

export function buildInvoiceText(order: Order, lang: Lang, contact?: InvoiceContact): string {
  const t = translations[lang];
  const lines: string[] = [];
  lines.push(`${t.invoiceTitle} — Easy Order`);
  lines.push("========================================");
  lines.push(`${t.customer}: ${order.customer_name}`);
  if (contact?.pib) lines.push(`${t.pib}: ${contact.pib}`);
  if (contact?.address) lines.push(`${t.address}: ${contact.address}`);
  if (contact?.phone) lines.push(`${t.phone}: ${contact.phone}`);
  if (contact?.email) lines.push(`${t.email}: ${contact.email}`);
  lines.push(`${t.date}: ${dayjs(order.created_at).format("DD.MM.YYYY HH:mm")}`);
  lines.push("");

  order.items.forEach((it, idx) => {
    lines.push(`${idx + 1}. ${it.name}`);
    if (it.manufacturer) lines.push(`   ${t.manufacturer}: ${it.manufacturer}`);
    lines.push(`   ${t.priceNoVat}: ${money(it.price_no_vat ?? 0)}`);
    lines.push(`   ${t.orderedPieces}: ${it.ordered_qty}`);
    lines.push(`   ${t.discount}: ${it.discount ?? 0}%`);
    lines.push(`   ${t.vatRate}: ${it.vat_rate ?? 0}%`);
    lines.push(`   ${t.lineTotal}: ${money(lineNet(it))}`);
    lines.push("");
  });

  const totals = computeTotals(order);
  lines.push("----------------------------------------");
  lines.push(`${t.subtotal}: ${money(totals.subtotal)}`);
  lines.push(`${t.vat}: ${money(totals.vat)}`);
  lines.push(`${t.grandTotal}: ${money(totals.grand)}`);
  return lines.join("\n");
}

export function buildInvoiceHtml(order: Order, lang: Lang, contact?: InvoiceContact): string {
  const t = translations[lang];
  const totals = computeTotals(order);
  const rows = order.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <strong>${escapeHtml(it.name)}</strong>
          ${it.manufacturer ? `<br/><span class="muted">${escapeHtml(it.manufacturer)}</span>` : ""}
        </td>
        <td class="num">${money(it.price_no_vat ?? 0)}</td>
        <td class="num">${it.ordered_qty}</td>
        <td class="num">${it.discount ?? 0}%</td>
        <td class="num">${it.vat_rate ?? 0}%</td>
        <td class="num">${money(lineNet(it))}</td>
      </tr>`
    )
    .join("");

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { font-family: -apple-system, Helvetica, Arial, sans-serif; }
        body { padding: 32px; color: #111827; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1A4D2E; padding-bottom: 16px; }
        .brand { font-size: 26px; font-weight: 800; color: #1A4D2E; }
        .doc { font-size: 13px; letter-spacing: 2px; color: #6B7280; font-weight: 700; }
        .meta { margin: 20px 0; font-size: 14px; line-height: 1.6; }
        .meta strong { display: inline-block; width: 90px; color: #6B7280; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th { text-align: left; background: #E8F3EB; color: #1A4D2E; padding: 10px 8px; }
        td { padding: 10px 8px; border-bottom: 1px solid #E5E7EB; }
        .num { text-align: right; }
        .muted { color: #6B7280; font-size: 12px; }
        .totals { margin-top: 20px; margin-left: auto; width: 300px; font-size: 14px; }
        .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
        .totals .grand { border-top: 2px solid #1A4D2E; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 800; color: #1A4D2E; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">Easy Order</div>
          <div class="doc">${t.invoiceTitle}</div>
        </div>
        <div class="meta" style="text-align:right; margin:0;">
          ${dayjs(order.created_at).format("DD.MM.YYYY HH:mm")}
        </div>
      </div>
      <div class="meta">
        <div><strong>${t.customer}:</strong> ${escapeHtml(order.customer_name)}</div>
        ${contact?.pib ? `<div><strong>${t.pib}:</strong> ${escapeHtml(contact.pib)}</div>` : ""}
        ${contact?.address ? `<div><strong>${t.address}:</strong> ${escapeHtml(contact.address)}</div>` : ""}
        ${contact?.phone ? `<div><strong>${t.phone}:</strong> ${escapeHtml(contact.phone)}</div>` : ""}
        ${contact?.email ? `<div><strong>${t.email}:</strong> ${escapeHtml(contact.email)}</div>` : ""}
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${t.products}</th>
            <th class="num">${t.priceNoVat}</th>
            <th class="num">${t.orderedPieces}</th>
            <th class="num">${t.discount}</th>
            <th class="num">${t.vat}</th>
            <th class="num">${t.lineTotal}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>${t.subtotal}</span><span>${money(totals.subtotal)}</span></div>
        <div class="row"><span>${t.vat}</span><span>${money(totals.vat)}</span></div>
        <div class="row grand"><span>${t.grandTotal}</span><span>${money(totals.grand)}</span></div>
      </div>
    </body>
  </html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
