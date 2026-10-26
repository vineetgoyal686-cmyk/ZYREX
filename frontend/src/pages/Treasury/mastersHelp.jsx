import { Lightbulb, X } from "lucide-react";

/*
 * Treasury — the "how this works" guide behind the bulb button, for the
 * Masters tabs and the Party Ledger screens.
 * One short guide per tab: what the tab is for, each field with an example,
 * and a few tips. Kept plain on purpose.
 */
const GUIDES = {
  // ── Party Ledger ──
  ledgerEntries: {
    intro: "Every payment and receipt, in one register. Add Detail records a new one; the cards show the totals for whatever the filters select.",
    fields: [
      ["Paid / Received", "Paid: money went out to a party. Received: money came in from a party.", "Paid ₹45,000 to A K Enterprises"],
      ["Our Company", "Whose books the entry belongs to.", "Netzewa Sustainable Solution Pvt Ltd"],
      ["Category", "The head it's filed under — used for reports.", "Material, Advance, Labour"],
      ["Narration", "The detail in plain words.", "50 bags cement for B-47"],
      ["Mode", "By Account (bank) or By Hand.", "By Account"],
      ["Our A/c / Their A/c", "Which account the money left and which it went into. Primary accounts fill in by themselves.", "HDFC ••4521 → Union Bank ••9780"],
    ],
    tips: [
      "Filters at the top (Project, Company, Party, dates) change the table and the totals together.",
      "Click a party's name to open its ledger.",
      "Each row has Edit, Delete and a Log of every change.",
    ],
  },
  ledgerParties: {
    intro: "Every party with its running balance — what is still to be paid or received.",
    fields: [
      ["Received / Paid", "Totals of all entries with this party.", "₹50,000 / ₹45,000"],
      ["Balance", "Red: Payable — we have to pay them. Green: Receivable — they have to pay us.", "₹5,000 in red = we owe ₹5,000"],
      ["Last entry", "The date of the latest payment or receipt.", "12.09.2026"],
    ],
    tips: ["Click a party to open its full ledger.", "An opening balance set in Masters is counted in."],
  },
  ledgerParty: {
    intro: "One party's account, Tally style: opening balance, every entry in date order, and the running balance.",
    fields: [
      ["Opening / Closing", "Balance at the start and end of the dates picked.", "Closing ₹5,000 Payable"],
      ["Particulars", "Category tag and narration; below it, which account the money left and which it went into.", "Advance · OURS HDFC ••4521 → PARTY Union ••9780"],
      ["Balance", "Red = Payable (we pay), green = Receivable (they pay).", "₹45,000 green"],
    ],
    tips: [
      "+ Paid / + Received adds an entry for this party in one step — usually just the amount.",
      "Click an account (OURS / PARTY / PERSONAL) to see its full number, IFSC and holder.",
      "Download gives the same ledger as PDF or Excel for the dates picked.",
    ],
  },
  // ── Loans & EMI ──
  loans: {
    intro: "Every loan the company has taken, with its EMIs — what's paid, what's left, what's overdue and the penalty on it.",
    fields: [
      ["Loan name / Lender", "What the loan is and who gave it.", "Machine loan · HDFC Bank"],
      ["Principal / Interest / Tenure", "Amount taken, yearly interest and months to repay.", "₹10,00,000 · 10% · 24 months"],
      ["EMI amount", "The monthly instalment. Calculate works it out from the three above.", "₹46,145"],
      ["First EMI date", "Date of the first instalment; the rest fall on the same date every month.", "28.08.2026"],
      ["Penalty if late", "Charged for every month an EMI stays unpaid: a fixed ₹, a % of the EMI, or both.", "₹500 + 2% per month"],
    ],
    tips: [
      "Remaining, Overdue and Penalty due in the list update by themselves as dates pass.",
      "Click a loan to see its full EMI schedule.",
    ],
  },
  loan: {
    intro: "One loan's EMI schedule — every instalment with its due date and whether it's paid, overdue or upcoming.",
    fields: [
      ["Overdue", "Due date has passed and it's not paid; penalty builds up month by month.", "EMI 2 · ₹1,422 penalty"],
      ["Mark Paid", "Record an EMI as paid: date, penalty actually paid, mode and UTR / cheque no.", "Paid on 27.09.2026 · UTR 4587…"],
      ["Undo", "Takes a paid EMI back to unpaid, if it was marked by mistake.", ""],
    ],
    tips: [
      "Mark Paid also adds a \"Paid\" entry (EMI + penalty, category EMI) for the lender in the Party Ledger.",
      "Edit changes the loan's terms; EMIs already paid stay as they were.",
    ],
  },
  // ── Masters ──
  parties: {
    intro: "Every firm you pay, or that pays you. Pick one here and the Party Ledger form fills in its details.",
    fields: [
      ["Firm Name", "The firm's name as you want it in the ledger.", "A K Enterprises"],
      ["Contact Person", "Who you talk to at the firm.", "Rakesh Sharma"],
      ["Mobile", "10-digit number of the contact person.", "9818869884"],
      ["PAN / GSTIN", "Tax numbers of the firm, if you have them.", "CLWPS3749F / 09CLWPS3749F1Z8"],
      ["Opening Balance", "Money already pending with this firm before you started entries here. Leave it 0 for a new firm.",
        "₹50,000 Payable — their bill was due before we started"],
      ["Payable / Receivable", "Payable: we have to pay them. Receivable: they have to pay us.", "Advance of ₹20,000 given → Receivable"],
    ],
    tips: [
      "Bank Details tab: add as many accounts as the firm has. The Primary one fills in automatically on a payment.",
      "Closed account? Mark it inactive — old entries still show it.",
      "Import from ERP copies a vendor from the Vendor Master with its bank details. After that the two are separate.",
    ],
  },
  companies: {
    intro: "Our own companies — the ones money is paid from or received into.",
    fields: [
      ["Company Name", "Our company's name.", "Netzewa Sustainable Solution Pvt Ltd"],
      ["Code", "A short code, if you use one.", "NSS"],
      ["PAN / GSTIN", "The company's PAN and GST number.", "AAICN1234A / 09AAICN1234A1Z5"],
      ["Bank Details", "All our bank accounts for this company. The Primary one is picked first on a payment.", "HDFC ••4521 (Primary), SBI ••8890"],
    ],
    tips: [
      "In the Party Ledger form, picking our company shows only its own accounts.",
      "Import from ERP copies a company with its bank account from Organisation.",
    ],
  },
  projects: {
    intro: "The projects an entry belongs to, so you can see spending project-wise.",
    fields: [
      ["Project Name", "The project's name.", "B-47 IAS House Noida"],
      ["Code", "Short code, if any.", "B47"],
      ["City / State", "Where the project is.", "Noida, Uttar Pradesh"],
    ],
    tips: ["Renaming a project also renames it on all its entries.", "Import from ERP copies projects from the ERP list."],
  },
  otherAccounts: {
    intro: "Bank accounts that belong to no company — a director's personal account, a site imprest account. You can pay from (or receive into) these for any company.",
    fields: [
      ["Whose Account", "Who the account belongs to.", "Rajesh Kumar (Director)"],
      ["Bank / Account / IFSC", "The account itself.", "SBI · 30012345678 · SBIN0001234"],
    ],
    tips: [
      "In a payment, these show under \"Other / Personal\" in Our A/c, whichever company you pick.",
      "Company still says whose expense it is — e.g. Netzewa's bill paid from Rajesh's personal account.",
      "\"+ Use another account\" in the entry adds a new one on the spot; tick \"Save\" to keep it here.",
    ],
  },
  categories: {
    intro: "A fixed list of heads every entry is filed under. They make reports possible, like \"how much went on Material this month\".",
    fields: [
      ["Code", "Given by the system, for reference.", "CAT-3"],
      ["Category", "The head, kept short.", "Material, Advance, Labour, Rent"],
    ],
    tips: ["Keep the list short — the exact detail goes in the entry's Narration.", "Renaming a category also renames it on its entries."],
  },
};

export function HelpButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} title="How this works"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#10243b] shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors">
      <Lightbulb size={16} />
    </button>
  );
}

export function HelpPanel({ tab, tabLabel, onClose }) {
  const g = GUIDES[tab];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="zy-panel-in h-full w-full max-w-[440px] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-[#10243b] text-white flex items-center justify-center shrink-0"><Lightbulb size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900">{tabLabel}</h2>
            <p className="text-[12px] text-slate-500">How this works</p>
          </div>
          <button onClick={onClose} title="Close" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <p className="text-[14px] leading-relaxed text-slate-700">{g.intro}</p>

          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Fields</p>
            <div className="space-y-2.5">
              {g.fields.map(([name, what, eg]) => (
                <div key={name} className="rounded-xl border border-slate-200 p-3.5">
                  <p className="text-[13px] font-semibold text-slate-900">{name}</p>
                  <p className="mt-0.5 text-[13px] text-slate-600">{what}</p>
                  {eg && <p className="mt-1.5 text-[12px] text-slate-500"><span className="font-semibold text-slate-400">e.g.</span> {eg}</p>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Good to know</p>
            <ul className="space-y-2">
              {g.tips.map(t => (
                <li key={t} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#10243b]/50 shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
