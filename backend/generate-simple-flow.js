const puppeteer = require("puppeteer");
const path = require("path");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: white; color: #1e293b; }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 16mm;
    background: white;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  /* ── TOP TITLE ── */
  .page-title {
    font-size: 22px; font-weight: 900; color: #1b3e8a;
    border-bottom: 3px solid #1b3e8a; padding-bottom: 8px; margin-bottom: 20px;
    letter-spacing: -0.5px;
  }

  /* ── FLOW STEP ── */
  .step { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 0; }

  .step-box {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 800;
    min-width: 200px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  .step-box .num { font-size: 10px; font-weight: 900; opacity: 0.6; }

  .s-draft     { background: #f1f5f9; border: 2.5px solid #64748b; color: #1e293b; }
  .s-review    { background: #e0f2fe; border: 2.5px solid #0284c7; color: #0c4a6e; }
  .s-pending   { background: #fef3c7; border: 2.5px solid #d97706; color: #78350f; }
  .s-issued    { background: #d1fae5; border: 2.5px solid #059669; color: #064e3b; }
  .s-rejected  { background: #fee2e2; border: 2.5px solid #dc2626; color: #7f1d1d; }
  .s-reverted  { background: #ffedd5; border: 2.5px solid #ea580c; color: #7c2d12; }
  .s-recalled  { background: #ede9fe; border: 2.5px solid #7c3aed; color: #3b0764; }
  .s-cancelled { background: #e2e8f0; border: 2.5px solid #475569; color: #334155; }
  .s-amended   { background: #fefce8; border: 2.5px solid #ca8a04; color: #713f12; }
  .s-clone     { background: #faf5ff; border: 2.5px dashed #7c3aed; color: #3b0764; }
  .s-start     { background: #e0e7ff; border: 2.5px solid #4f46e5; color: #1e1b4b; }

  /* ── ARROW ── */
  .arrow { display: flex; align-items: center; gap: 0; margin: 2px 0 2px 24px; }
  .arrow-line { width: 2px; height: 20px; background: #94a3b8; }
  .arrow-tip {
    width: 0; height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid #94a3b8;
    margin-left: -4px;
  }
  .arrow-label {
    margin-left: 10px; font-size: 10.5px; font-weight: 700;
    color: #4f46e5; background: #eef2ff; border-radius: 5px;
    padding: 2px 8px; white-space: nowrap;
  }
  .arrow-wrap { display: flex; flex-direction: column; align-items: flex-start; }

  /* ── ACTIONS BLOCK ── */
  .actions-block {
    margin: 6px 0 6px 32px;
    border-left: 3px solid #e2e8f0;
    padding-left: 16px;
  }
  .actions-title {
    font-size: 10px; font-weight: 800; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;
  }
  .action-row {
    display: flex; align-items: flex-start; gap: 10px;
    margin-bottom: 5px;
  }
  .action-btn {
    font-size: 11px; font-weight: 800; padding: 3px 10px;
    border-radius: 6px; white-space: nowrap; flex-shrink: 0;
  }
  .a-green  { background: #d1fae5; color: #065f46; border: 1.5px solid #059669; }
  .a-blue   { background: #dbeafe; color: #1e40af; border: 1.5px solid #3b82f6; }
  .a-orange { background: #ffedd5; color: #7c2d12; border: 1.5px solid #ea580c; }
  .a-red    { background: #fee2e2; color: #7f1d1d; border: 1.5px solid #dc2626; }
  .a-purple { background: #ede9fe; color: #3b0764; border: 1.5px solid #7c3aed; }
  .a-slate  { background: #e2e8f0; color: #1e293b; border: 1.5px solid #64748b; }
  .a-indigo { background: #e0e7ff; color: #1e1b4b; border: 1.5px solid #4f46e5; }
  .a-amber  { background: #fef3c7; color: #78350f; border: 1.5px solid #d97706; }

  .action-desc {
    font-size: 11px; color: #475569; line-height: 1.5;
  }
  .action-desc strong { color: #1e293b; }

  /* ── OUTCOME BRANCHES ── */
  .branches { display: flex; gap: 12px; margin: 8px 0 8px 32px; flex-wrap: wrap; }
  .branch {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    min-width: 100px;
  }
  .branch-arrow { font-size: 16px; color: #94a3b8; line-height: 1; }
  .branch-label { font-size: 9.5px; font-weight: 700; color: #64748b; text-align: center; }

  /* ── NOTE BOX ── */
  .note {
    font-size: 11px; color: #475569; background: #f8fafc;
    border: 1.5px solid #e2e8f0; border-radius: 8px;
    padding: 8px 12px; margin: 6px 0 6px 32px; line-height: 1.6;
  }
  .note strong { color: #1e293b; }
  .note.warn { background: #fff7ed; border-color: #fed7aa; color: #7c2d12; }
  .note.info { background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a; }
  .note.success { background: #f0fdf4; border-color: #bbf7d0; color: #064e3b; }

  .divider { border: none; border-top: 2px dashed #e2e8f0; margin: 18px 0; }

  .who-tag {
    display: inline-block; font-size: 9.5px; font-weight: 800;
    padding: 1px 7px; border-radius: 20px; margin-right: 4px; flex-shrink: 0;
  }
  .who-admin  { background: #1b3e8a; color: white; }
  .who-power  { background: #7c3aed; color: white; }
  .who-normal { background: #0284c7; color: white; }
  .who-all    { background: #059669; color: white; }

  .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }

  @page { margin: 0; size: A4; }
  @media print { body { background: white; } }
</style>
</head>
<body>

<!-- ══════════════════════════════════════════════════ -->
<!--                    PAGE 1                         -->
<!-- ══════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-title">📋 Order Module — Complete Flow</div>

  <!-- STEP 0: CREATE -->
  <div class="step">
    <div class="step-box s-start">🚀 &nbsp;Create Order</div>
  </div>
  <div class="note info" style="margin-left:0;">
    <strong>Order Type:</strong> Supply → Purchase Order (PO-N) &nbsp;|&nbsp; Service → Work Order (WO-N)<br/>
    <strong>Kaun bana sakta hai:</strong> <span class="who-tag who-all">create order permission</span> wala koi bhi user
  </div>

  <!-- ARROW -->
  <div class="arrow" style="margin-left:0;">
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div class="arrow-line"></div>
      <div class="arrow-tip"></div>
    </div>
  </div>

  <!-- ── STEP 1: DRAFT ── -->
  <div class="step">
    <div class="step-box s-draft">📝 &nbsp;DRAFT &nbsp;<span class="num">(Temp no: PO-1 / WO-3)</span></div>
  </div>

  <div class="actions-block">
    <div class="actions-title">Is stage pe possible actions:</div>

    <div class="action-row">
      <span class="action-btn a-blue">Edit Order</span>
      <div class="action-desc">
        <span class="who-tag who-admin">Global Admin</span>
        <span class="who-tag who-all">create order permission</span>
        — koi bhi jinke paas permission hai<br/>
        <strong>Log mein dikhega:</strong> kisne edit kiya
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-blue">Submit to Review</span>
      <div class="action-desc">
        <span class="who-tag who-all">create order permission</span> wala koi bhi<br/>
        ⚠️ <strong>Mandatory:</strong> 1 Quotation doc + 1 Proof doc (Comparative / Vendor doc) — dono zaroori hain
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-red">Cancel Amendment</span>
      <div class="action-desc">
        <em>Sirf tab dikhega jab yeh order ek amended clone hai</em><br/>
        <span class="who-tag who-admin">Global Admin</span> ya order creator — clone delete hoga, original wapas Issued
      </div>
    </div>
  </div>

  <div class="arrow" style="margin-left:0;">
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div class="arrow-line"></div>
      <div class="arrow-tip"></div>
    </div>
    <span class="arrow-label">Submit to Review</span>
  </div>

  <!-- ── STEP 2: REVIEW ── -->
  <div class="step">
    <div class="step-box s-review">🔍 &nbsp;REVIEW</div>
  </div>

  <div class="actions-block">
    <div class="actions-title">Is stage pe possible actions:</div>

    <div class="action-row">
      <span class="action-btn a-blue">Edit Order</span>
      <div class="action-desc">
        <span class="who-tag who-admin">Global Admin</span>
        <span class="who-tag who-all">create order permission</span>
        — same as Draft<br/>
        <strong>Log mein dikhega:</strong> kisne edit kiya
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-indigo">Submit for Approval</span>
      <div class="action-desc">
        <span class="who-tag who-all">create order permission</span> wala koi bhi<br/>
        Approval chain start hoti hai → Status: <strong>Pending Issue</strong>
      </div>
    </div>
  </div>

  <div class="arrow" style="margin-left:0;">
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div class="arrow-line"></div>
      <div class="arrow-tip"></div>
    </div>
    <span class="arrow-label">Submit for Approval</span>
  </div>

  <!-- ── STEP 3: PENDING ISSUE ── -->
  <div class="step">
    <div class="step-box s-pending">⏳ &nbsp;PENDING ISSUE &nbsp;<span class="num">(Approval in progress)</span></div>
  </div>

  <div class="actions-block">
    <div class="actions-title">Approver ke paas yeh buttons honge:</div>

    <div class="action-row">
      <span class="action-btn a-green">Approve</span>
      <div class="action-desc">
        <span class="who-tag who-power">Approver (approve perm)</span>
        Next approval step pe move karta hai
      </div>
    </div>
    <div class="action-row">
      <span class="action-btn a-green">Issue</span>
      <div class="action-desc">
        <span class="who-tag who-power">Approver (issue perm)</span>
        <span class="who-tag who-admin">Global Admin</span>
        Direct issue → Final PO/WO number assign → <strong>Status: Issued</strong>
      </div>
    </div>
    <div class="action-row">
      <span class="action-btn a-orange">Revert</span>
      <div class="action-desc">
        <span class="who-tag who-power">Approver (revert perm)</span>
        Comment mandatory → Order wapas Review ya Draft mein
      </div>
    </div>
    <div class="action-row">
      <span class="action-btn a-red">Reject</span>
      <div class="action-desc">
        <span class="who-tag who-power">Approver (reject perm)</span>
        Comment mandatory → <strong>Status: Rejected</strong> (order band)
      </div>
    </div>
  </div>

  <!-- BRANCHES FROM PENDING -->
  <div class="branches">
    <div class="branch">
      <div class="branch-arrow">↓</div>
      <div class="branch-label">Issue / Approve</div>
      <div class="step-box s-issued" style="min-width:90px;font-size:11px;padding:7px 12px;">✅ ISSUED</div>
    </div>
    <div class="branch">
      <div class="branch-arrow">↓</div>
      <div class="branch-label">Revert</div>
      <div class="step-box s-reverted" style="min-width:90px;font-size:11px;padding:7px 12px;">↩️ REVERTED</div>
    </div>
    <div class="branch">
      <div class="branch-arrow">↓</div>
      <div class="branch-label">Reject</div>
      <div class="step-box s-rejected" style="min-width:90px;font-size:11px;padding:7px 12px;">❌ REJECTED</div>
    </div>
  </div>

  <div class="note warn">
    <strong>Rejected / Reverted:</strong> Comment mandatory hota hai. Rejected = order band, sirf view. Reverted = wapas editing ke liye.
  </div>

  <div class="footer">Order Module Flow — Page 1 of 2</div>
</div>

<!-- ══════════════════════════════════════════════════ -->
<!--                    PAGE 2                         -->
<!-- ══════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-title">📋 Order Module — Issued ke baad ka Flow</div>

  <!-- ISSUED -->
  <div class="step">
    <div class="step-box s-issued">✅ &nbsp;ISSUED &nbsp;<span class="num">(Final PO/WO number assigned)</span></div>
  </div>

  <div class="note success" style="margin-left:0;">
    Is stage pe order final ho jaata hai. Ab do tarah ke users alag alag kaam kar sakte hain.
  </div>

  <hr class="divider"/>

  <!-- GLOBAL ADMIN + POWER USER -->
  <div style="font-size:12px;font-weight:800;color:#7c3aed;margin-bottom:10px;">
    <span class="who-tag who-admin">Global Admin</span>
    <span class="who-tag who-power">Power User (recall/cancel perm)</span>
    — Direct Actions:
  </div>

  <div class="actions-block" style="border-color:#c4b5fd;">

    <div class="action-row">
      <span class="action-btn a-indigo">Amend</span>
      <div class="action-desc">
        Reason + Attachment mandatory<br/>
        → Original order = <strong>Amended</strong> status<br/>
        → Ek clone order banta hai → <strong>Draft</strong> mein aata hai editing ke liye<br/>
        → Clone edit hoga → phir Draft → Review → Approval → Issued cycle repeat
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-purple">Recall</span>
      <div class="action-desc">
        Comment mandatory<br/>
        → Status: <strong>Recalled</strong> → Order Draft mein wapas aata hai
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-slate">Cancel</span>
      <div class="action-desc">
        Comment mandatory<br/>
        → Status: <strong>Cancelled</strong> → Order band, sirf view
      </div>
    </div>
  </div>

  <hr class="divider"/>

  <!-- NORMAL USER -->
  <div style="font-size:12px;font-weight:800;color:#0284c7;margin-bottom:10px;">
    <span class="who-tag who-normal">Normal User</span>
    — Request submit karna padega (direct action nahi):
  </div>

  <div class="actions-block" style="border-color:#bae6fd;">

    <div class="action-row">
      <span class="action-btn a-blue">Request → Amend</span>
      <div class="action-desc">
        Comment + Attachment mandatory → Request submit hoti hai<br/>
        Admin ke paas ViewOrder mein <strong>banner dikhega</strong> (Approve / Reject):<br/>
        &nbsp;&nbsp;→ <strong>Approve:</strong> Clone order Draft mein, original Amended<br/>
        &nbsp;&nbsp;→ <strong>Reject:</strong> Request band, order Issued hi rahega<br/>
        <em>Note: Jab tak admin action nahi leta, user apni request cancel kar sakta hai</em>
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-blue">Request → Recall</span>
      <div class="action-desc">
        Comment mandatory → Request submit hoti hai<br/>
        Admin approve kare → <strong>Recalled</strong> &nbsp;|&nbsp; Reject kare → Issued rahega
      </div>
    </div>

    <div class="action-row">
      <span class="action-btn a-blue">Request → Cancel</span>
      <div class="action-desc">
        Comment mandatory → Request submit hoti hai<br/>
        Admin approve kare → <strong>Cancelled</strong> &nbsp;|&nbsp; Reject kare → Issued rahega
      </div>
    </div>
  </div>

  <hr class="divider"/>

  <!-- AMENDMENT SPECIAL CASE -->
  <div style="font-size:12px;font-weight:800;color:#ca8a04;margin-bottom:8px;">✏️ Amendment ke baad ka special case:</div>

  <div class="note warn" style="margin-left:0;">
    Jab amendment approve hoti hai → clone order <strong>Draft</strong> mein aata hai.<br/>
    Is Draft mein <strong>"Cancel Amendment"</strong> button dikhega (Power User / Admin ko).<br/>
    → Cancel karo → clone delete, original wapas <strong>Issued</strong><br/>
    → Na karo → Clone normal flow follow karega: Draft → Review → Approval → Issued<br/>
    <br/>
    <strong>Important:</strong> "Cancel Amendment" button sirf Draft stage mein dikhta hai.
    Jaise hi clone Review ya aage jaata hai — button gayab.
  </div>

  <hr class="divider"/>

  <!-- STATUS SUMMARY -->
  <div style="font-size:12px;font-weight:800;color:#1b3e8a;margin-bottom:10px;">📊 Saare Status — Ek Nazar Mein:</div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#f1f5f9;border:1.5px solid #64748b;">
      <div style="width:10px;height:10px;border-radius:50%;background:#64748b;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Draft</strong> <span style="font-size:10px;color:#64748b;">— Bana hai, editing phase</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#e0f2fe;border:1.5px solid #0284c7;">
      <div style="width:10px;height:10px;border-radius:50%;background:#0284c7;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Review</strong> <span style="font-size:10px;color:#0c4a6e;">— Internal review</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#fef3c7;border:1.5px solid #d97706;">
      <div style="width:10px;height:10px;border-radius:50%;background:#d97706;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Pending Issue</strong> <span style="font-size:10px;color:#78350f;">— Approval chain mein</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#d1fae5;border:1.5px solid #059669;">
      <div style="width:10px;height:10px;border-radius:50%;background:#059669;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Issued ✓</strong> <span style="font-size:10px;color:#064e3b;">— Final, permanent number</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#fee2e2;border:1.5px solid #dc2626;">
      <div style="width:10px;height:10px;border-radius:50%;background:#dc2626;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Rejected</strong> <span style="font-size:10px;color:#7f1d1d;">— Band, sirf view</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#ffedd5;border:1.5px solid #ea580c;">
      <div style="width:10px;height:10px;border-radius:50%;background:#ea580c;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Reverted</strong> <span style="font-size:10px;color:#7c2d12;">— Wapas bheja editing ke liye</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#ede9fe;border:1.5px solid #7c3aed;">
      <div style="width:10px;height:10px;border-radius:50%;background:#7c3aed;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Recalled</strong> <span style="font-size:10px;color:#3b0764;">— Issued se wapas liya</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#e2e8f0;border:1.5px solid #475569;">
      <div style="width:10px;height:10px;border-radius:50%;background:#475569;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Cancelled</strong> <span style="font-size:10px;color:#334155;">— Cancel, sirf view</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#fefce8;border:1.5px solid #ca8a04;">
      <div style="width:10px;height:10px;border-radius:50%;background:#ca8a04;flex-shrink:0;"></div>
      <div><strong style="font-size:11px;">Amended</strong> <span style="font-size:10px;color:#713f12;">— Original (clone edit ho raha)</span></div>
    </div>
  </div>

  <div class="footer">Order Module Flow — Page 2 of 2 &nbsp;|&nbsp; Zyrex BMS &nbsp;|&nbsp; ${new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}</div>
</div>

</body>
</html>`;

(async () => {
  const outPath = path.join(__dirname, "..", "Order_Module_Flow_Simple.pdf");
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  console.log("Generating PDF...");
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
  });
  await browser.close();
  console.log(`✅ Done: ${outPath}`);
})();
