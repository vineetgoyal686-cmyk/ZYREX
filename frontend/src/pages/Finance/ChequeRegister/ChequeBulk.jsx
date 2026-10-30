import React from "react";
import API from "../../../api";
import BulkImportModal from "../../../components/BulkImportModal";
import { parseDate, currentUserName } from "../../Attendance/utils";
import { STATUS, TYPES, inr, fmtDay } from "./utils";

/* Cheque Register › Bulk Upload — many cheques from one Excel sheet.
   Saved through POST /api/cheques/bulk (same checks as the form). */
const COLS = ["Type", "Cheque No", "Cheque Date", "Amount", "Party", "Bank", "Account No", "Cheque Type",
  "For (Project / Office Code)", "Purpose", "Bill / PO No", "Handed To / Collected By", "Status", "Status Date", "Bounce Reason", "Remarks"];
const low = (v) => String(v ?? "").trim().toLowerCase();

export default function ChequeBulk({ company, places, existing, today, onClose, onDone }) {
  const placeCodes = new Map(places.map(p => [low(p.code), p]));
  const taken = new Set(existing.map(c => `${c.direction}|${low(c.bankName)}|${c.chequeNo}`));
  const seen = new Set();

  const parse = (pick, line) => {
    if (line === 2) seen.clear(); // a new file
    const type = low(pick("Type"));
    const noRaw = String(pick("Cheque No")).replace(/\D/g, "");
    const amountRaw = pick("Amount");
    const party = String(pick("Party")).trim();
    if (!type && !noRaw && !amountRaw && !party) return { blank: true };

    const direction = /^(r|received|receive|got|in)/.test(type) ? "received" : /^(i|issued|issue|given|paid|out)/.test(type) ? "issued" : "";
    // Excel drops leading zeros (001207 → 1207): put them back
    const chequeNo = noRaw && noRaw.length <= 6 ? noRaw.padStart(6, "0") : noRaw;
    const chequeDate = parseDate(pick("Cheque Date"));
    const amount = Number(String(amountRaw).replace(/[₹,\s]/g, ""));
    const bankName = String(pick("Bank")).trim();
    const ct = low(pick("Cheque Type")).replace(/[^a-z]/g, "");
    const chequeType = ct.startsWith("bear") ? "bearer" : ct === "self" ? "self" : "account_payee";
    const placeCode = String(pick("For (Project / Office Code)", "For", "Project", "Office")).trim();
    const st = low(pick("Status"));
    const status = st ? Object.keys(STATUS).find(s => low(s) === st || low(s).replace(/\s/g, "") === st.replace(/\s/g, "")) : "Pending";
    const statusDateRaw = pick("Status Date");
    const statusDate = statusDateRaw ? parseDate(statusDateRaw) : null;
    const bounceReason = String(pick("Bounce Reason")).trim();

    let error = "";
    if (!direction) error = 'Type must be "Issued" or "Received"';
    else if (!/^\d{6}$/.test(chequeNo)) error = "Cheque No must be 6 digits";
    else if (!chequeDate) error = "Cheque Date missing or not a date";
    else if (!(amount > 0)) error = "Amount missing";
    else if (!party) error = "Party missing";
    else if (!bankName) error = "Bank missing";
    else if (placeCode && !placeCodes.has(low(placeCode))) error = `No project / office "${placeCode}" in ${company.code || company.name}`;
    else if (!status) error = `Unknown status "${pick("Status")}"`;
    else if (statusDateRaw && !statusDate) error = "Status Date not a date";
    else if (statusDate && statusDate > today) error = "Status Date is in the future";
    else if (status === "Bounced" && !bounceReason) error = "Bounced needs a Bounce Reason";
    if (!error) {
      const key = `${direction}|${low(bankName)}|${chequeNo}`;
      if (taken.has(key)) error = "Already recorded";
      else if (seen.has(key)) error = "Twice in the file";
      seen.add(key);
    }
    return {
      error,
      cells: [direction === "issued" ? "Issued" : direction === "received" ? "Received" : String(pick("Type")), chequeNo || "",
        chequeDate ? fmtDay(chequeDate) : "", amount > 0 ? inr(amount) : "", party, bankName, placeCode, status || String(pick("Status"))],
      data: {
        direction, chequeNo, chequeDate, amount, partyName: party, bankName, accountNo: String(pick("Account No")).trim(),
        chequeType, placeCode: placeCodes.get(low(placeCode))?.code || "", purpose: String(pick("Purpose")).trim(),
        reference: String(pick("Bill / PO No", "Bill No", "PO No", "Reference")).trim(),
        handedTo: String(pick("Handed To / Collected By", "Handed To", "Collected By")).trim(),
        status, statusDate, bounceReason, remarks: String(pick("Remarks")).trim(),
      },
    };
  };

  return (
    <BulkImportModal
      title="Bulk Upload Cheques" subtitle={company.name}
      fileName={`Cheque_upload_${company.code || "company"}.xlsx`} cols={COLS}
      templateRows={() => [
        { Type: "Issued", "Cheque No": "104601", "Cheque Date": today, Amount: 50000, Party: "ABC Traders", Bank: "HDFC Bank", "Account No": "4521",
          "Cheque Type": "A/c Payee", "For (Project / Office Code)": places.find(p => p.kind === "project")?.code || "", Purpose: "Material advance",
          "Bill / PO No": "", "Handed To / Collected By": "", Status: "Pending", "Status Date": "", "Bounce Reason": "", Remarks: "Example row — replace or delete" },
      ]}
      help={[
        ["Type", "Issued (we paid) or Received (we got)"],
        ["Cheque No", "6 digits. Leading zeros dropped by Excel are put back (1207 → 001207)."],
        ["Cheque Date", "YYYY-MM-DD or DD-MM-YYYY"],
        ["Amount", "In rupees, e.g. 50000 or 50,000.50"],
        ["Party", "Paid to (Issued) / received from (Received)"],
        ["Bank", "Our bank (Issued) / their bank (Received)"],
        ["Cheque Type", TYPES.map(t => t[1]).join(" / ") + " (blank = A/c Payee)"],
        ["For (Project / Office Code)", "Optional. Codes in this company: " + places.map(p => p.code).filter(Boolean).join(", ")],
        ["Status", Object.keys(STATUS).join(" / ") + " (blank = Pending)"],
        ["Status Date", "When it got that status (blank = cheque date). Not in the future."],
        ["Bounce Reason", "Needed when Status is Bounced"],
        ["", ""],
        ["Note", "The same cheque number of the same bank can't be recorded twice. Attachments are added later from Edit."],
      ]}
      previewHead={["Type", "Cheque No", "Date", "Amount", "Party", "Bank", "For", "Status"]}
      parse={parse}
      save={async (rows) => (await API.post("/api/cheques/bulk", { company_id: company.id, rows, byName: currentUserName() })).data}
      onClose={onClose} onDone={onDone}
    />
  );
}
