const { escapeHtml, formatDate } = require("./helpers");

const STATUS_STYLE = {
  draft:    { bg: "#f1f5f9", color: "#64748b", label: "Draft"    },
  active:   { bg: "#dcfce7", color: "#16a34a", label: "Active"   },
  archived: { bg: "#fee2e2", color: "#dc2626", label: "Archived" },
};

const renderPolicyHtml = (policy) => {
  const s = STATUS_STYLE[policy.status] || STATUS_STYLE.draft;
  const content = policy.content
    ? policy.content
    : "<p style='color:#94a3b8;font-style:italic;'>No content provided.</p>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @page { size: A4; margin: 36mm 14mm 28mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-size: 11.5px; line-height: 1.75; }

  .title-block { margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2.5px solid #1e40af; }
  .policy-code { font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 5px; }
  .policy-title { font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-bottom: 8px; }
  .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${s.bg}; color: ${s.color}; letter-spacing: .4px; }

  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; margin-bottom: 22px; }
  .meta-cell { padding: 9px 14px; border-right: 1px solid #e2e8f0; }
  .meta-cell:nth-child(3n) { border-right: none; }
  .meta-cell:nth-child(n+4) { border-top: 1px solid #e2e8f0; }
  .meta-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: .6px; margin-bottom: 3px; }
  .meta-value { font-size: 12px; font-weight: 600; color: #1e293b; }

  .content-body { font-size: 12px; line-height: 1.8; color: #1e293b; }
  .content-body p  { margin: 0 0 10px; }
  .content-body h1 { font-size: 18px; font-weight: 800; margin: 22px 0 8px; color: #0f172a; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; }
  .content-body h2 { font-size: 15px; font-weight: 700; margin: 16px 0 6px; color: #1e293b; }
  .content-body h3 { font-size: 13px; font-weight: 700; margin: 12px 0 4px; color: #334155; }
  .content-body ul, .content-body ol { margin: 0 0 10px; padding-left: 22px; }
  .content-body li { margin-bottom: 4px; }
  .content-body strong { font-weight: 700; }
  .content-body em { font-style: italic; }
  .content-body u  { text-decoration: underline; }
  .content-body blockquote { border-left: 3px solid #3b82f6; margin: 10px 0; padding: 6px 14px; background: #f8fafc; color: #475569; font-style: italic; }
  .content-body table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  .content-body table th { background: #f1f5f9; font-weight: 700; text-align: left; padding: 6px 10px; border: 1px solid #cbd5e1; }
  .content-body table td { padding: 6px 10px; border: 1px solid #cbd5e1; vertical-align: top; }
</style>
</head>
<body>

  <div class="title-block">
    <div class="policy-code">${escapeHtml(policy.policy_code)}</div>
    <div class="policy-title">${escapeHtml(policy.title)}</div>
    <span class="status-badge">${s.label}</span>
  </div>

  <div class="meta-grid">
    <div class="meta-cell"><div class="meta-label">Version</div><div class="meta-value">${escapeHtml(policy.version || "v1.0")}</div></div>
    <div class="meta-cell"><div class="meta-label">Category</div><div class="meta-value">${escapeHtml(policy.category || "—")}</div></div>
    <div class="meta-cell"><div class="meta-label">Department</div><div class="meta-value">${escapeHtml(policy.department || "—")}</div></div>
    <div class="meta-cell"><div class="meta-label">Effective Date</div><div class="meta-value">${formatDate(policy.effective_date)}</div></div>
    <div class="meta-cell"><div class="meta-label">Review Date</div><div class="meta-value">${formatDate(policy.review_date)}</div></div>
    <div class="meta-cell"><div class="meta-label">Approved By</div><div class="meta-value">${escapeHtml(policy.approved_by || "—")}</div></div>
  </div>

  <div class="content-body">${content}</div>

</body>
</html>`;
};

const renderPolicyHeader = (policy, comp, logoDataUri = "") => {
  const companyName = comp.company_name || comp.companyName || "";
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;width:100%;padding:6px 14mm 0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;height:54px;">
        ${logoDataUri
          ? `<img src="${logoDataUri}" style="max-height:46px;max-width:170px;object-fit:contain;object-position:left bottom;display:block;" />`
          : `<div></div>`}
        <div style="text-align:right;line-height:1.2;">
          <div style="font-size:13px;font-weight:800;color:#0f172a;">${escapeHtml(companyName)}</div>
          <div style="font-size:9px;font-weight:700;color:#64748b;letter-spacing:1.2px;text-transform:uppercase;margin-top:2px;">POLICY DOCUMENT</div>
        </div>
      </div>
      <div style="height:2.5px;background:linear-gradient(to right,#1e40af,#3b82f6);margin-top:5px;border-radius:2px;"></div>
    </div>
  `;
};

const renderPolicyFooter = (comp) => {
  const name    = comp.company_name || comp.companyName || "";
  const address = comp.address || "";
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;width:100%;padding:0 14mm;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <div style="height:1px;background:#cbd5e1;margin-bottom:5px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:9.5px;color:#1e293b;">${escapeHtml(name)}</div>
          ${address ? `<div style="font-size:8.5px;color:#64748b;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(address)}</div>` : ""}
        </div>
        <div style="font-size:9px;font-weight:600;color:#64748b;white-space:nowrap;margin-left:12px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      </div>
    </div>
  `;
};

module.exports = { renderPolicyHtml, renderPolicyHeader, renderPolicyFooter };
