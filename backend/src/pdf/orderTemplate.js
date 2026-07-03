const {
  escapeHtml,
  formatDate,
  formatINR,
  amountToWords,
  sanitizeHtml,
  parseDescription,
  parseMake,
  groupItems,
} = require("./helpers");

const css = `
  @page { size: A4; margin: 31mm 10mm 22mm 10mm; }
  @page :first { margin-top: 27mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-size: 11px; line-height: 1.6; }
  :root { --box-line: 1px solid #333; }

  .page { position: relative; padding-top: 18px; }
  .page + .page { page-break-before: always; }
  .annexure-page { page-break-before: always; break-before: page; }
  .annexure-title {
    display: block; text-align: center; font-size: 18px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 3px; margin: 0 0 14px 0;
    padding-bottom: 8px; border-bottom: 2px solid #000;
  }
  .annexure-content { font-size: 12px; line-height: 1.65; text-align: justify; }
  .annexure-content p { margin: 0 0 6px 0; }
  .annexure-content ol { margin: 0 0 6px 0; padding-left: 26px; list-style: decimal; }
  .annexure-content ol ol { list-style-type: lower-alpha; }
  .annexure-content ol ol ol { list-style-type: lower-roman; }
  .annexure-content ul { margin: 0 0 6px 0; padding-left: 26px; list-style: disc; }
  .annexure-content li { margin-bottom: 4px; }
  .annexure-content img { max-width: 100%; height: auto; }

  table.order-frame { width: 100%; border-collapse: collapse; border: 1px solid #333; margin: -2mm 0 0; }
  table.order-frame td { border: 1px solid #333; vertical-align: top; }
  table.order-frame .meta-td { padding: 4px 7px; vertical-align: middle; width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0; }
  table.order-frame .detail-td { padding: 9px 11px; width: 50%; }
  .label { font-size: 10.5px; font-weight: 700; text-transform: none; display: inline-block; min-width: 80px; margin-right: 6px; color: #555; }
  .value { font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .details-tab {
    clip-path: polygon(0 0, 100% 0, 85% 100%, 0 100%);
    background: #000000 !important; color: #ffffff !important; padding: 3px 22px 3px 8px;
    font-weight: 800; font-size: 10px; text-transform: uppercase;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    display: inline-block; margin-bottom: 7px;
  }
  .party-name { font-size: 13px; font-weight: 700; margin-bottom: 7px; }
  .card { margin-bottom: 7px; }
  .card-title { display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1.5px solid #999; padding-bottom: 1px; }
  .card-text { font-size: 10.5px; font-weight: 400; }
  .kv { display: grid; grid-template-columns: 75px 1fr; gap: 3px; font-size: 9.5px; margin-bottom: 2px; }
  .kv-label { font-weight: 700; text-transform: uppercase; font-size: 9px; }
  .kv-value { font-weight: 400; }
  .kv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; }

  .subject-bar {
    border: var(--box-line); border-top: 0; background: #d4d4d8;
    padding: 6px 14px; text-align: center; margin: 0 0 8px 0;
    font-size: 12px; font-weight: 700; letter-spacing: .3px;
  }
  .subject-bar .lbl { margin-right: 8px; }

  table.items { width: 100%; border-collapse: collapse; border: 0; font-size: 11px; }
  table.items thead { background: #d4d4d8; display: table-header-group; }
  table.items thead .page-gap th {
    padding: 0; height: 0; border-left: 0; border-right: 0;
    border-top: 0; border-bottom: 0; background: #fff;
  }
  table.items th, table.items td { border: var(--box-line); padding: 6px 7px; vertical-align: top; }
  table.items td.item-desc { padding: 8px 9px; }
  table.items tr.item-row > td { padding-top: 9px; }
  table.items th { font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: center; }
  table.items .r { text-align: right; white-space: nowrap; }
  table.items .c { text-align: center; white-space: nowrap; }
  table.items .item-name { font-weight: 700; font-size: 12.5px; margin-bottom: 4px; }
  table.items .item-name-plain { font-weight: 400; font-size: 11px; }
  table.items td.merge-first { border-bottom: 0; }
  table.items td.merge-fill { border-top: 0; border-bottom: 0; visibility: hidden; }
  table.items td.merge-last { border-top: 0; visibility: hidden; }
  table.items .item-desc { text-align: justify; }
  table.items tfoot { display: table-footer-group; }
  table.items tfoot td { padding: 0; height: 0; line-height: 0; border: 0; border-top: var(--box-line); background: #fff; }
  table.items td.merge-fill .item-name, table.items td.merge-last .item-name,
  table.items td.merge-fill .item-name-plain, table.items td.merge-last .item-name-plain { display: none; }
  table.items .item-desc p, table.items .item-desc div { margin: 0 0 2px 0; }
  table.items .item-desc ul { margin: 2px 0; padding-left: 14px; list-style: disc; }
  table.items .item-desc ol { margin: 2px 0; padding-left: 14px; list-style: decimal; }
  table.items .meta-row { font-size: 9.5px; margin-top: 2px; }
  table.items .meta-row b { font-weight: 700; }
  table.items .amount-col { background: #fafafa; font-weight: 700; }
  tr.item-row { page-break-inside: auto; break-inside: auto; }
  .point-label {
    display: inline-block; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em; color: #000;
    margin: 0 0 4px 0; padding-bottom: 1.5px; border-bottom: 1px solid #000;
  }
  .desc-block + .desc-block { margin-top: 6px; }

  .totals-wrap { display: flex; justify-content: space-between; gap: 14px; border: var(--box-line); padding: 9px 11px; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid-page; }
  .words-box { flex: 1; background: #e4e4e7; padding: 9px 11px; }
  .words-box .words-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #444; margin-bottom: 4px; }
  .words-box .words-text { font-size: 14px; font-weight: 700; }
  .totals-box { width: 250px; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; font-size: 10.5px; }
  .totals-row .lbl { font-weight: 700; text-transform: uppercase; }
  .totals-row .val { font-weight: 700; }
  .totals-row.grand { background: #e4e4e7; border-bottom: 3px solid #000; padding: 7px 10px; }
  .totals-row.grand .lbl { font-size: 11.5px; }
  .totals-row.grand .val { font-size: 13px; }
  .totals-row.discount { color: #b91c1c; }

  .section { margin-top: 10px; }
  .section-title {
    clip-path: polygon(0 0, 100% 0, 85% 100%, 0 100%);
    background: #000; color: #fff; padding: 3px 22px 3px 8px;
    font-weight: 700; font-size: 10.5px; text-transform: uppercase;
    display: inline-block; margin-bottom: 6px; page-break-inside: avoid;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .section .content { font-size: 12.5px; line-height: 1.7; text-align: justify; color: #000 !important; }
  .section .content p, .section .content li, .section .content span, .section .content div { color: #000 !important; }
  .section .content ol { margin: 0 0 6px 0; padding-left: 28px; list-style: decimal; }
  .section .content ol ol { list-style-type: lower-alpha; }
  .section .content ol ol ol { list-style-type: lower-roman; }
  .section .content ul { margin: 0 0 6px 0; padding-left: 28px; list-style: disc; }
  .section .content li { margin-bottom: 4px; }
  .section .content > ol > li { margin-bottom: 10px; }
  .section .content p { margin: 0 0 4px 0; }
  .section .content b, .section .content strong { font-weight: 700; }

  .signatures { margin-top: 24px; padding-left: 8mm; display: flex; justify-content: space-between; gap: 70px; page-break-inside: avoid; break-inside: avoid-page; align-items: flex-start; }
  .sig-side { flex: 1; min-width: 0; }
  .sig-side.right { display: flex; flex-direction: column; align-items: flex-end; }
  .sig-box { width: 100%; max-width: 400px; }
  .sig-top { font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; }
  .sig-area { position: relative; height: 110px; margin-bottom: 12px; }
  .sig-stamp { position: absolute; left: 60px; top: 50%; transform: translate(-50%, -50%); height: 90px; width: auto; object-fit: contain; opacity: 0.75; }
  .sig-sign { position: absolute; left: 60px; top: 50%; transform: translate(-50%, -50%); height: 70px; width: auto; object-fit: contain; z-index: 2; }
  .sig-italic { font-size: 12px; font-weight: 600; color: #111827; font-style: italic; margin-bottom: 8px; }
  .sig-kv { font-size: 11px; line-height: 1.6; }
  .sig-kv b { font-weight: 700; color: #111827; }
`;

const renderMetaGrid = (order, site) => {
  const isSupply = order.order_type === "Supply";
  const rows = [
    [isSupply ? "PO No." : "WO No.", order.order_number],
    [isSupply ? "PO Date" : "WO Date", formatDate(order.date_of_creation || order.created_at)],
    ["Ref. No.", order.ref_number],
    ["Created By", order.creator_name || order.made_by],
    ["Project", site?.site_name || site?.siteName || order.project_name],
    ["Requisition By", order.request_by || order.requested_by],
  ];

  let html = "";
  for (let i = 0; i < rows.length; i += 2) {
    html += "<tr>";
    for (let j = 0; j < 2; j++) {
      const row = rows[i + j];
      if (!row) { html += `<td class="meta-td"></td>`; continue; }
      html += `<td class="meta-td"><span class="label">${escapeHtml(row[0])} :</span><span class="value">${escapeHtml(row[1] || "--")}</span></td>`;
    }
    html += "</tr>";
  }
  return html;
};

const renderVendorCard = (vend) => `
    <div class="details-tab">Vendor Details</div>
    <div class="party-name">${escapeHtml(vend.vendor_name || vend.vendorName || "N/A")}</div>
    <div class="card">
      <div class="card-title">Address</div>
      <div class="card-text">${escapeHtml(vend.address || "N/A")}</div>
    </div>
    <div class="card">
      <div class="card-title">Bank Details</div>
      <div class="kv"><span class="kv-label">Bank Name:</span><span class="kv-value">${escapeHtml(vend.bank_name || vend.bankName || "N/A")}</span></div>
      <div class="kv"><span class="kv-label">Acc No.:</span><span class="kv-value">${escapeHtml(vend.account_number || vend.accountNo || "N/A")}</span></div>
      <div class="kv"><span class="kv-label">IFSC:</span><span class="kv-value">${escapeHtml(vend.ifsc_code || vend.ifsc || "N/A")}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Tax / GST Details</div>
      <div class="kv-grid-2">
        <div class="kv"><span class="kv-label">GST No:</span><span class="kv-value">${escapeHtml(vend.gstin || "N/A")}</span></div>
        <div class="kv"><span class="kv-label">PAN:</span><span class="kv-value">${escapeHtml(vend.pan || "N/A")}</span></div>
        <div class="kv"><span class="kv-label">MSME:</span><span class="kv-value">${escapeHtml(vend.msme_number || vend.msme || vend.msme_no || "N/A")}</span></div>
        <div class="kv"><span class="kv-label">Aadhar:</span><span class="kv-value">${escapeHtml(vend.aadhar || vend.aadhar_no || "N/A")}</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Contact Detail</div>
      <div class="kv"><span class="kv-label">Person:</span><span class="kv-value">${escapeHtml(vend.contact_person || vend.contactPerson || "N/A")}</span></div>
      <div class="kv"><span class="kv-label">Phone:</span><span class="kv-value">${escapeHtml(vend.mobile || vend.phone || "N/A")}</span></div>
      <div class="kv"><span class="kv-label">Email:</span><span class="kv-value">${escapeHtml(vend.email || "N/A")}</span></div>
    </div>
`;

const renderCompanyCard = (comp, site, contacts, billingProfile) => `
    <div class="details-tab">Company Details</div>
    <div class="party-name">${escapeHtml(comp.company_name || comp.companyName || "N/A")}</div>
    <div class="card">
      <div class="card-title">Site Address</div>
      <div class="card-text">${escapeHtml(site.site_address || site.siteAddress || "N/A")}</div>
    </div>
    <div class="card">
      <div class="card-title">Billing Address</div>
      <div class="card-text">${escapeHtml(billingProfile?.address || "N/A")}</div>
    </div>
    <div class="card">
      <div class="card-title">Tax / GST Details</div>
      <div class="kv"><span class="kv-label">GST No:</span><span class="kv-value">${escapeHtml(billingProfile?.gstin || "N/A")}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Contact Persons</div>
      ${
        contacts && contacts.length
          ? contacts
              .filter(c => c && (c.person_name || c.personName)) // Filter out invalid contacts
              .map(
                (c, index) => {
                  // Clean the name by removing tabs, newlines, and extra spaces
                  const rawName = c.person_name || c.personName || "N/A";
                  const cleanName = rawName.replace(/[\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
                  const phone = c.contact_number || c.contactNumber || "N/A";
                  return `<div style="display: flex; margin-bottom: 2px; font-size: 10.5px; align-items: center;">
                    <span style="font-weight: 400; width: 180px; display: inline-block;">${escapeHtml(cleanName)}</span>
                    <span style="font-weight: 400; display: flex; align-items: center;">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="#000" style="margin-right:4px;flex-shrink:0;"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/></svg>
                      ${escapeHtml(phone)}
                    </span>
                  </div>`;
                }
              )
              .join("")
          : '<div class="card-text" style="font-style:italic;color:#666;">-- NA --</div>'
      }
    </div>
`;

const renderItemsTable = (order, items) => {
  const isSupply = order.order_type === "Supply";
  const totals = order.totals || {};
  const grouped = groupItems(items);
  const allRows = grouped.flatMap((g) => g.rows);
  const showDiscount = totals.discount_mode === "line" && allRows.some((i) => Number(i.discount_pct) > 0);
  const showGst = allRows.some((i) => Number(i.tax_pct) > 0);
  const showRemarks = allRows.some((i) => i.remarks) && totals.showRemarks !== false;
  const extraCols = (showDiscount ? 1 : 0) + (showGst ? 1 : 0);
  const colCount = showRemarks
    ? ((isSupply ? 6 : 5) + extraCols + 1)
    : ((isSupply ? 5 : 4) + extraCols + 1);

  let rowsHtml = "";
  grouped.forEach((group) => {
    const rowSpan = group.rows.length || 0;
    let groupRowsHtml = "";
    group.rows.forEach((it, idx) => {
      const rawDescRaw = it.description || it.specification || it.items?.description;
      const rawDesc = (rawDescRaw === "--" || rawDescRaw === "---") ? "" : rawDescRaw;
      const descParts = parseDescription(rawDesc);
      const showPointLabel = !isSupply && rowSpan > 1;
      const descHtml = descParts
        .map((p, partIdx) => {
          const pointNumber = showPointLabel ? idx + 1 : partIdx + 1;
          const labelHtml = (!isSupply && (showPointLabel || descParts.length > 1))
            ? `<div class="point-label">Point ${pointNumber}</div>`
            : "";
          return `<div class="desc-block">${labelHtml}<div>${sanitizeHtml(p) || ""}</div></div>`;
        })
        .join("");
      const brands = parseMake(it.make);
      const brandText = brands.length === 1 ? brands[0] : "";

      const mergeClass = rowSpan > 1
        ? (idx === 0 ? " merge-first" : (idx === rowSpan - 1 ? " merge-last" : " merge-fill"))
        : "";

      const srCell = `<td class="c${mergeClass}">${idx === 0 ? String(group.srNo).padStart(2, "0") : ""}</td>`;

      const hasDesc = descHtml.trim() !== "";
      const groupHasAnyDesc = group.rows.some(r => {
        const rd = r.description || r.specification || r.items?.description;
        return rd && rd !== "--" && rd !== "---" && String(rd).trim() !== "";
      });

      const itemNameCell = isSupply
        ? `<td class="${mergeClass.trim()}" style="vertical-align: top;">${idx === 0 ? `<div class="${groupHasAnyDesc ? "item-name" : "item-name-plain"}">${escapeHtml(group.itemName)}</div>` : ""}</td>`
        : "";

      const descCell = isSupply
        ? `<td class="item-desc">${descHtml}
            ${it.model_number ? `<div class="meta-row"><b>Model No.:</b> ${escapeHtml(it.model_number)}</div>` : ""}
            ${brandText ? `<div class="meta-row"><b>Brand:</b> ${escapeHtml(brandText)}</div>` : ""}
           </td>`
        : `<td class="item-desc">
            ${idx === 0 ? `<div class="${groupHasAnyDesc ? "item-name" : "item-name-plain"}">${escapeHtml(group.itemName)}</div>` : ""}
            ${descHtml}
            ${it.model_number ? `<div class="meta-row"><b>Model No.:</b> ${escapeHtml(it.model_number)}</div>` : ""}
            ${brandText ? `<div class="meta-row"><b>Brand:</b> ${escapeHtml(brandText)}</div>` : ""}
           </td>`;

      const needsPointOffset = !isSupply && idx === 0 && showPointLabel;
      const offsetStyle = needsPointOffset ? ' style="padding-top: 32px;"' : "";

      groupRowsHtml += `<tr class="item-row">
        ${srCell}
        ${itemNameCell}
        ${descCell}
        <td class="c"${offsetStyle}>${escapeHtml(it.unit || group.unit || "NOS")}</td>
        <td class="c"${offsetStyle}>${escapeHtml(String(it.qty ?? "--"))}</td>
        <td class="r"${offsetStyle}>₹ ${formatINR(it.unit_rate)}</td>
        ${showDiscount ? `<td class="c"${offsetStyle}>${escapeHtml(String(it.discount_pct || 0))}%</td>` : ""}
        ${showGst ? `<td class="c"${offsetStyle}>${escapeHtml(String(it.tax_pct || 0))}%</td>` : ""}
        <td class="r amount-col"${offsetStyle}>₹ ${formatINR(it.amount)}</td>
        ${showRemarks ? `<td${offsetStyle}>${escapeHtml(it.remarks || "--")}</td>` : ""}
      </tr>`;
    });
    rowsHtml += `<tbody class="item-group">${groupRowsHtml}</tbody>`;
  });

  const nameHeader = isSupply
    ? `<th style="width:22%">Item Name</th><th>Specification</th>`
    : `<th>Item Name & Description</th>`;

  return `
    <table class="items">
      <thead>
        <tr class="page-gap"><th colspan="${colCount}"></th></tr>
        <tr>
          <th style="width:28px">Sr.</th>
          ${nameHeader}
          <th style="width:44px">Unit</th>
          <th style="width:48px">Qty</th>
          <th style="width:66px">Rate</th>
          ${showDiscount ? '<th style="width:44px">Disc%</th>' : ""}
          ${showGst ? '<th style="width:44px">GST%</th>' : ""}
          <th style="width:86px">Amount</th>
          ${showRemarks ? '<th style="width:90px">Remarks</th>' : ""}
        </tr>
      </thead>
      ${rowsHtml}
      <tfoot>
        <tr class="table-page-footer"><td colspan="${colCount}"></td></tr>
      </tfoot>
    </table>
  `;
};

const renderTotals = (order) => {
  const t = order.totals || {};
  const subtotal = Number(t.subtotal) || 0;
  const discAmt = Number(t.totalDiscountAmt) || 0;
  const discPct = Number(t.txDiscountPct || t.discount_pct) || 0;
  const fright = Number(t.frightCharges ?? t.fright) || 0;
  const frightTax = Number(t.frightTax ?? 18);
  const gst = Number(t.gst) || 0;
  const grand = Number(t.grandTotal) || subtotal - discAmt + fright + gst;
  const taxMode = t.tax_mode || "line";
  const showGstRow = taxMode !== "none";

  return `
    <div class="totals-wrap">
      <div class="words-box">
        <div class="words-label">Amount in Words</div>
        <div class="words-text">${escapeHtml(amountToWords(grand))}</div>
      </div>
      <div class="totals-box">
        <div class="totals-row"><span class="lbl">Subtotal</span><span class="val">₹ ${formatINR(subtotal)}</span></div>
        ${discAmt > 0 ? `<div class="totals-row discount"><span class="lbl">Discount ${discPct ? `(${discPct}%)` : ""}</span><span class="val">- ₹ ${formatINR(discAmt)}</span></div>` : ""}
        ${fright > 0 ? `<div class="totals-row"><span class="lbl">Freight (${frightTax}%)</span><span class="val">₹ ${formatINR(fright)}</span></div>` : ""}
        ${showGstRow ? `<div class="totals-row"><span class="lbl">GST Total</span><span class="val">₹ ${formatINR(gst)}</span></div>` : ""}
        <div class="totals-row grand"><span class="lbl">Grand Total</span><span class="val">₹ ${formatINR(grand)}</span></div>
      </div>
    </div>
  `;
};

const renderRichSectionLegacy = (title, content) => {
  if (!content) return "";
  let body = "";
  if (Array.isArray(content)) {
    const stripListPrefix = (v) =>
      String(v ?? "")
        // remove leading "1.", "1)", "1-", "1:", "(1)." etc (space optional)
        .replace(/^\s*(?:\(?\d+\)?\s*[.)\-:]+|[-*•])\s*/, "");
    const toLines = (v) => {
      const html = String(v ?? "");
      // convert common HTML line/paragraph/list boundaries into newlines first
      const withNewlines = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n")
        .replace(/<\/li\s*>/gi, "\n");
      // strip tags but keep newlines, then normalize whitespace per-line
      const text = withNewlines
        .replace(/&nbsp;|&#160;|\u00A0/g, " ")
        .replace(/<[^>]*>/g, " ");
      return text
        .split(/\r?\n/)
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    };

    const lines = content.flatMap((c) => toLines(c));
    const raw = content.map((c) => String(c ?? "")).join(" ");
    const hasHtmlList = /<\s*(?:ol|ul|li)\b/i.test(raw);
    const first = lines[0] || "";
    const looksNumbered = stripListPrefix(first) !== first;
    const shouldRenderAsList = hasHtmlList || looksNumbered;

    body = shouldRenderAsList
      ? `<ol>${lines.map((line) => `<li>${escapeHtml(stripListPrefix(line))}</li>`).join("")}</ol>`
      : `${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}`;
  } else {
    body = sanitizeHtml(content);
  }
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="content">${body}</div>
    </div>
  `;
};

const hasHtmlMarkup = (value) => /<\s*[a-z][\s\S]*>/i.test(String(value || ""));

const stripPlainListPrefix = (value) =>
  String(value ?? "")
    .replace(/^\s*(?:\(?\d+\)?\s*[.)\-:]+|[-*â€¢])\s*/, "");

const plainTextLines = (value) =>
  String(value ?? "")
    .replace(/&nbsp;|&#160;|\u00A0/g, " ")
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const renderNodeList = (list) =>
  `<${list.tag}>${list.items.map((item) => `<li>${item.html}${item.children.map(renderNodeList).join("")}</li>`).join("")}</${list.tag}>`;

const stripQuillListNoise = (html) =>
  String(html || "")
    .replace(/<span\b[^>]*class=["'][^"']*\bql-ui\b[^"']*["'][^>]*><\/span>/gi, "")
    .replace(/<span\b[^>]*class=["'][^"']*\bql-ui\b[^"']*["'][^>]*\/>/gi, "")
    .replace(/\s*data-list=["'][^"']*["']/gi, "")
    .replace(/\s*class=["'](?:\s*ql-indent-\d+\s*)+["']/gi, "");

const rebuildFlatQuillList = (tag, attrs, innerHtml) => {
  const items = [];
  innerHtml.replace(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi, (_match, liAttrs = "", liHtml = "") => {
    const indentMatch = liAttrs.match(/\bql-indent-(\d+)\b/i);
    const dataListMatch = liAttrs.match(/\bdata-list=["']([^"']+)["']/i);
    items.push({
      indent: indentMatch ? Number(indentMatch[1]) || 0 : 0,
      tag: dataListMatch?.[1] === "bullet" ? "ul" : tag.toLowerCase(),
      html: stripQuillListNoise(liHtml).trim(),
    });
    return "";
  });

  if (!items.length || !items.some((item) => item.indent > 0)) {
    return `<${tag}${attrs}>${stripQuillListNoise(innerHtml)}</${tag}>`;
  }

  const root = { tag: items[0]?.tag || tag.toLowerCase(), items: [] };
  const listsAtLevel = [root];
  const lastLiAtLevel = [];

  items.forEach((item) => {
    let level = item.indent;
    while (level > 0 && !lastLiAtLevel[level - 1]) level -= 1;

    if (level > 0 && (!listsAtLevel[level] || listsAtLevel[level].tag !== item.tag)) {
      const parentLi = lastLiAtLevel[level - 1];
      const childList = { tag: item.tag, items: [] };
      parentLi.children.push(childList);
      listsAtLevel[level] = childList;
    }

    const li = { html: item.html, children: [] };
    listsAtLevel[level].items.push(li);
    lastLiAtLevel[level] = li;
    listsAtLevel.length = level + 1;
    lastLiAtLevel.length = level + 1;
  });

  return renderNodeList(root);
};

const normalizeRichHtmlForPdf = (html) => {
  const normalized = sanitizeHtml(html);
  if (!/\b(?:ql-indent-\d+|data-list=|ql-ui)\b/i.test(normalized)) return normalized;

  return normalized
    .replace(/<(ol|ul)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, innerHtml) => {
      if (!/\b(?:ql-indent-\d+|data-list=|ql-ui)\b/i.test(innerHtml)) return match;
      return rebuildFlatQuillList(tag, attrs || "", innerHtml);
    })
    .replace(/\s*data-list=["'][^"']*["']/gi, "")
    .replace(/\s*class=["'](?:\s*ql-indent-\d+\s*)+["']/gi, "")
    .replace(/<span\b[^>]*class=["'][^"']*\bql-ui\b[^"']*["'][^>]*><\/span>/gi, "");
};

const renderRichSection = (title, content) => {
  if (!content) return "";
  let body = "";
  if (Array.isArray(content)) {
    const entries = content.filter((entry) => hasMeaningfulContent(entry));
    const hasHtml = entries.some(hasHtmlMarkup);

    if (hasHtml) {
      body = entries.map((entry) => normalizeRichHtmlForPdf(entry)).join("");
    } else {
      const lines = entries.flatMap(plainTextLines);
      const first = lines[0] || "";
      const shouldRenderAsList = lines.length > 1 || stripPlainListPrefix(first) !== first;
      body = shouldRenderAsList
        ? `<ol>${lines.map((line) => `<li>${escapeHtml(stripPlainListPrefix(line))}</li>`).join("")}</ol>`
        : lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
    }
  } else if (hasHtmlMarkup(content)) {
    body = normalizeRichHtmlForPdf(content);
  } else {
    body = plainTextLines(content).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  }
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <div class="content">${body}</div>
    </div>
  `;
};

const hasMeaningfulContent = (content) => {
  if (!content) return false;
  if (Array.isArray(content)) return content.some((entry) => hasMeaningfulContent(entry));
  const plain = String(content)
    .replace(/&nbsp;|&#160;|\u00A0/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 0;
};

const renderSupplementary = (order) => {
  const sections = [
    ["Order Notes", order.notes],
    ["Terms & Conditions", order.terms_conditions],
    ["Payment Terms", order.payment_terms],
    ["Governing Laws", order.governing_laws],
  ];
  return sections
    .filter(([, content]) => hasMeaningfulContent(content))
    .map(([title, content]) => renderRichSection(title, content))
    .join("");
};

const renderAnnexure = (order) => {
  const content = order.annexures;
  if (!hasMeaningfulContent(content)) return "";
  let body = "";
  if (Array.isArray(content)) {
    body = content
      .filter((c) => hasMeaningfulContent(c))
      .map((c) => sanitizeHtml(c))
      .join("");
  } else {
    body = sanitizeHtml(content);
  }
  return `
    <div class="annexure-title">Annexure</div>
    <div class="annexure-content">${body}</div>
  `;
};

const renderSignatures = (order, comp, vend, issuer = null) => {
  const companyName = comp.company_name || comp.companyName || "Company";
  const vendorName = vend.vendor_name || vend.vendorName || "Vendor";
  const vendorPerson = vend.contact_person || vend.contactPerson || "";
  const isIssued = ["Issued", "Amended"].includes(order.status);

  const stampUrl = comp.stampDataUri || comp.stampUrl || comp.stamp_url || "";
  const signUrl  = isIssued ? (issuer?.signDataUri || comp.signDataUri || comp.signUrl || comp.sign_url || "") : "";
  const companyPerson = isIssued ? (issuer?.name || comp.person_name || comp.personName || order.made_by || "") : "";
  const companyDesig  = isIssued ? (issuer?.designation || comp.designation || "") : "";
  const poDate = isIssued ? formatDate(order.totals?.issuedAt || order.date_of_creation || order.created_at) : "";

  return `
    <div class="signatures">
      <div class="sig-side">
        <div class="sig-box">
          <div class="sig-top">${escapeHtml(companyName)}</div>
          <div class="sig-area">
            ${stampUrl ? `<img class="sig-stamp" src="${escapeHtml(stampUrl)}" alt="Stamp" />` : ""}
            ${signUrl ? `<img class="sig-sign" src="${escapeHtml(signUrl)}" alt="Signature" />` : ""}
          </div>
          <div class="sig-italic">(Authorized Signature)</div>
          <div class="sig-kv">
            <div><b>Name:</b> ${escapeHtml(companyPerson || "")}</div>
            <div><b>Date:</b> ${escapeHtml(poDate)}</div>
          </div>
        </div>
      </div>

      <div class="sig-side right">
        <div class="sig-box">
          <div class="sig-top">${escapeHtml(vendorName)}</div>
          <div class="sig-area"></div>
          <div class="sig-italic">(Agreed & Accepted by)</div>
          <div class="sig-kv">
            <div><b>Name:</b> ${escapeHtml(vendorPerson || "")}</div>
            <div><b>Date:</b> </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

const renderHeaderTemplate = (order, comp, logoDataUri = "") => {
  const isSupply = order.order_type === "Supply";
  const title = isSupply ? "PURCHASE ORDER" : "WORK ORDER";
  const companyName = (comp.company_name || comp.companyName || "").toLowerCase();
  const isUnivastu = companyName.includes("univastu");
  const logoStyle = isUnivastu
    ? "position: absolute; left: 0; bottom: 6px; max-height: 72px; max-width: 190px; object-fit: contain; object-position: left bottom; display:block;"
    : "position: absolute; left: 0; bottom: 0; max-height: 90px; max-width: 250px; object-fit: contain; object-position: left bottom; display:block;";
  return `
    <div style="font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif; width: 100%; padding: 8px 10mm 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
      <div style="position: relative; height: 65px; width: 100%;">
        ${logoDataUri ? `<img src="${logoDataUri}" style="${logoStyle}" />` : ""}
        <span style="position: absolute; right: 0; bottom: 22px; background:#000; color:#fff; padding: 7px 28px 7px 38px; font-weight: 900; font-size: 15px; letter-spacing: .8px; clip-path: polygon(14% 0, 100% 0, 100% 100%, 0% 100%); display: inline-block; line-height: 1;">${title}</span>
      </div>
      <div style="height: 2.5px; background: #000; width: 100%; margin-top: 6px;"></div>
    </div>
  `;
};

const renderPreviewHeader = (order, comp, logoDataUri = "") => {
  const isSupply = order.order_type === "Supply";
  const title = isSupply ? "PURCHASE ORDER" : "WORK ORDER";
  const companyName = (comp.company_name || comp.companyName || "").toLowerCase();
  const previewLogoClass = companyName.includes("univastu")
    ? "preview-logo preview-logo-univastu"
    : "preview-logo";
  return `
    <div class="preview-header">
      <div class="preview-header-inner">
        ${logoDataUri ? `<img src="${logoDataUri}" class="${previewLogoClass}" />` : ""}
        <span class="preview-title">${title}</span>
      </div>
      <div class="preview-header-line"></div>
    </div>
  `;
};

const renderFooterTemplate = (comp) => {
  const name = comp.company_name || comp.companyName || "";
  const address = comp.address || "";
  return `
    <div style="font-family: 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif; width: 100%; padding: 2.5mm 10mm 0.5mm; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; position: relative; min-height: 16mm;">
      <div style="height: 0.8px; background: #000; width: 100%; margin-bottom: 6px;"></div>
      <div style="text-align: center; padding: 0 52px 0 52px;">
        <div style="font-weight: 700; font-size: 11px; line-height: 1.15;">${escapeHtml(name)}</div>
        ${address ? `<div style="font-weight: 500; font-size: 9.25px; color:#222; margin-top: 2px; line-height: 1.1; white-space: nowrap;">${escapeHtml(address)}</div>` : ""}
      </div>
      <div style="position: absolute; right: 10mm; top: 5mm; font-weight: 600; font-size: 8.5px; white-space: nowrap;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    </div>
  `;
};

const previewCss = `
  html { scroll-behavior: auto; }
  body {
    background: #e5e7eb; padding: 24px 0;
    /* Avoid per-frame repaints of background during scroll in Chrome */
    background-attachment: local;
  }
  .sheet {
    width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 21mm 10mm 22mm;
    background: #fff;
    /* Lighter shadow + GPU layer so Chrome doesn't repaint shadow every scroll frame */
    box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    position: relative; box-sizing: border-box;
    transform: translateZ(0);
    will-change: transform;
    contain: layout paint style;
  }
  .sheet img { image-rendering: auto; }
  .preview-header { margin-bottom: 6px; }
  .preview-header-inner { position: relative; height: 65px; width: 100%; }
  .preview-logo {
    position: absolute; left: 0; bottom: 0; max-height: 90px; max-width: 250px;
    object-fit: contain; object-position: left bottom; display: block;
  }
  .preview-logo-univastu {
    bottom: 6px;
    max-height: 72px;
    max-width: 190px;
  }
  .preview-title {
    position: absolute; right: 0; bottom: 22px; background:#000; color:#fff;
    padding: 7px 28px 7px 38px; font-weight: 900; font-size: 15px; letter-spacing: .8px;
    clip-path: polygon(14% 0, 100% 0, 100% 100%, 0% 100%); display: inline-block; line-height: 1;
  }
  .preview-header-line { height: 2.5px; background: #000; width: 100%; margin-top: 6px; }
  .sheet > .page { padding-top: 18px; }
  .page + .page { page-break-before: auto; margin-top: 24px; }
`;

const resolveBillingProfile = (order, comp, site) => {
  // Prefer snapshot-saved profile (set at order creation time)
  if (order.snapshot?.billingProfile) return order.snapshot.billingProfile;

  const siteState = site.state || site.site_state;
  const blocks = comp.state_billing_profiles || comp.stateBillingProfiles || [];

  // 1. Try state-specific profile
  if (siteState && blocks.length) {
    const block = blocks.find(b => {
      const name = b.stateName || b.state_name || b.state || "";
      return name.toLowerCase() === siteState.toLowerCase();
    });
    const profiles = block?.profiles || [];
    const profile = profiles.find(p => p.isDefault) || profiles[0];
    if (profile) return profile;
  }

  // 2. Fallback: entity-level billing address + gstin
  const fallbackAddr = comp.billing_address || comp.billingAddress || comp.address || "";
  const fallbackGstin = comp.billing_gstin || comp.billingGstin || comp.gstin || "";
  if (fallbackAddr || fallbackGstin) {
    return { address: fallbackAddr, gstin: fallbackGstin };
  }
  return null;
};

const renderOrderHtml = ({ order, items = [], comp = {}, vend = {}, site = {}, contacts = [], issuer = null, previewHeaderHtml = "" }, { preview = false } = {}) => {
  const subject = order.subject || order.order_name || "";
  const billingProfile = resolveBillingProfile(order, comp, site);
  const extraCss = preview ? previewCss : "";
  const openWrap = preview ? `<div class="sheet">` : "";
  const closeWrap = preview ? `</div>` : "";
  const annexureHtml = renderAnnexure(order);
  const annexureBlock = annexureHtml
    ? (preview
        ? `${closeWrap}<div class="sheet">${previewHeaderHtml || ""}<div class="page annexure-page">${annexureHtml}</div>${closeWrap}`
        : `<div class="page annexure-page">${annexureHtml}</div>`)
    : "";
  const mainClose = annexureHtml && preview ? "" : closeWrap;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>${css}${extraCss}</style>
</head>
<body>
${openWrap}
${preview ? previewHeaderHtml : ""}
<div class="page">
  <table class="order-frame">
    ${renderMetaGrid(order, site)}
    <tr>
      <td class="detail-td">${renderVendorCard(vend)}</td>
      <td class="detail-td">${renderCompanyCard(comp, site, contacts, billingProfile)}</td>
    </tr>
  </table>
  ${subject ? `<div class="subject-bar"><span class="lbl">Subject :</span>${escapeHtml(subject)}</div>` : ""}
  ${renderItemsTable(order, items)}
  ${renderTotals(order)}
  ${renderSupplementary(order)}
  ${renderSignatures(order, comp, vend, issuer)}
</div>
${mainClose}
${annexureBlock}
</body>
</html>`;
};

module.exports = { renderOrderHtml, renderHeaderTemplate, renderFooterTemplate, renderPreviewHeader };
