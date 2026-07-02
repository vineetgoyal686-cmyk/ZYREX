import React, { useState, useEffect, useRef } from "react";
import { Plus, MapPin, ChevronDown, FileSpreadsheet, FileText, Upload, Download, Loader2 } from "lucide-react";
import CompanyList from "../Procurement/CompanyList";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700", "bg-teal-100 text-teal-700",
];
const avatarColor = (name = "") => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const initials = (name = "") => name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/* ── Logo Modal ───────────────────────────────────────── */
function LogoModal({ company, name, onClose }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 cursor-zoom-out" onClick={onClose}>
      {company.logoUrl ? (
        <div className="bg-white rounded p-6 shadow-2xl cursor-default w-72 h-72 flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <img src={company.logoUrl} alt={name} className="w-full h-full object-contain" />
        </div>
      ) : (
        <div className={`w-48 h-48 rounded flex items-center justify-center text-5xl font-black shadow-2xl cursor-default ${avatarColor(name)}`} onClick={e => e.stopPropagation()}>
          {initials(name)}
        </div>
      )}
    </div>
  );
}

/* ── Single Org Card ──────────────────────────────────── */
function OrgCard({ company, onOpen }) {
  const [showLogo, setShowLogo] = useState(false);
  const name     = company.companyName || company.company_name || "";
  const code     = company.companyCode || company.company_code || "";
  const gstin    = company.gstin || "";
  const district = (company.district || "").trim();
  const state    = (company.state || "").trim();
  const pincode  = (company.pincode || "").trim();
  const status   = (company.status || "active").toLowerCase();
  const location = [district, state].filter(Boolean).join(", ");
  const locStr   = location ? (pincode ? `${location} — ${pincode}` : location) : "";

  return (
    <div className="bg-white rounded border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {showLogo && <LogoModal company={company} name={name} onClose={() => setShowLogo(false)} />}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div onClick={() => setShowLogo(true)} className="shrink-0 cursor-pointer rounded ring-2 ring-transparent hover:ring-blue-400 transition-all">
          {company.logoUrl
            ? <img src={company.logoUrl} alt="" className="w-11 h-11 rounded object-contain border border-slate-100 bg-slate-50 p-1" />
            : <div className={`w-11 h-11 rounded flex items-center justify-center text-sm font-black ${avatarColor(name)}`}>{initials(name)}</div>
          }
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-slate-900 leading-snug truncate">{name}</p>
          <p className="text-[11px] font-semibold text-blue-600 mt-0.5">{code}</p>
        </div>
      </div>
      <div className="border-t border-slate-100" />
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {[{ label: "Divisions", val: company._divCount ?? 0 }, { label: "Depts", val: company._deptCount ?? 0 }, { label: "Employees", val: company._empCount ?? 0 }].map(s => (
          <div key={s.label} className="text-center py-3">
            <p className="text-[17px] font-bold text-slate-800 leading-none">{s.val}</p>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100" />
      <div className="px-4 py-3 space-y-2">
        {locStr && <div className="flex items-start gap-1.5"><MapPin size={12} className="shrink-0 text-slate-400 mt-0.5" /><p className="text-[12px] font-medium text-slate-600 leading-tight">{locStr}</p></div>}
        {gstin ? <p className="text-[12px]"><span className="text-slate-400 font-medium">GSTIN: </span><span className="text-slate-800 font-bold">{gstin}</span></p>
               : <p className="text-[12px] text-slate-400 italic">No GSTIN</p>}
      </div>
      <div className="border-t border-slate-100" />
      <div className="flex items-center justify-between px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${status === "active" ? "text-emerald-600" : "text-slate-400"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} /> {status === "active" ? "Active" : "Inactive"}
        </span>
        <button onClick={() => onOpen(company)} className="flex items-center gap-1 px-4 py-1.5 bg-slate-900 text-white text-[12px] font-semibold rounded hover:bg-blue-600 transition-colors">Open →</button>
      </div>
    </div>
  );
}

/* ── Add Card ─────────────────────────────────────────── */
function AddCard({ onClick }) {
  return (
    <button onClick={onClick} className="bg-white rounded border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 min-h-[180px] hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
      <div className="w-10 h-10 rounded border-2 border-dashed border-slate-300 group-hover:border-blue-400 flex items-center justify-center">
        <Plus size={18} className="text-slate-400 group-hover:text-blue-500" />
      </div>
      <p className="text-sm font-semibold text-slate-400 group-hover:text-blue-500">Add Organisation</p>
    </button>
  );
}

/* ── Main OrgList ─────────────────────────────────────── */
export default function OrgList({ onSelectOrg, showAdd, onAddDone, actionsRef, view = "card", onCountChange }) {
  const [companies,   setCompanies]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [importing,   setImporting]   = useState(false);
  const importRef = useRef(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/companies`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
      const data = await res.json();
      const list = data.companies || [];
      setCompanies(list);
      onCountChange?.(list.length);
    } catch { setCompanies([]); onCountChange?.(0); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCompanies(); }, []);
  useEffect(() => { if (showAdd) setShowAddFlow(true); }, [showAdd]);

  /* ── Export Excel ── */
  const exportExcel = () => {
    const rows = companies.map((c, i) => ({
      "#":             i + 1,
      "Company Name":  c.companyName || c.company_name || "",
      "Code":          c.companyCode || c.company_code || "",
      "GSTIN":         c.gstin || "",
      "PAN":           c.pan || "",
      "State":         c.state || "",
      "District":      c.district || "",
      "Pincode":       c.pincode || "",
      "Phone":         c.phone || "",
      "Email":         c.email || "",
      "Status":        (c.status || "active"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Organisations");
    XLSX.writeFile(wb, "organisations.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Organisations", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${companies.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Company Name", "Code", "GSTIN", "State", "District", "Phone", "Status"]],
      body: companies.map((c, i) => [
        i + 1,
        c.companyName || c.company_name || "",
        c.companyCode || c.company_code || "",
        c.gstin || "—",
        c.state || "—",
        c.district || "—",
        c.phone || "—",
        c.status || "active",
      ]),
      styles: { fontSize: 8, cellPadding: 2.5, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { halign: "center", cellWidth: 10 }, 7: { halign: "center", cellWidth: 18 } },
      didDrawPage: d => { doc.setFontSize(7); doc.setTextColor(148, 163, 184); doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" }); },
    });
    doc.save("organisations.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Company Name", "Code", "GSTIN", "PAN", "State", "District", "Pincode", "Phone", "Email", "Status"],
      ["Bootes Impex Tech Pvt Ltd", "BITL", "06AAJCB6841Q1Z2", "AAJCB6841Q", "Haryana", "Gurgaon", "122101", "", "", "active"],
      ["", "", "", "", "", "", "", "", "", ""],
      ["Valid Status: active / inactive", "", "", "", "", "", "", "", "", ""],
    ]);
    ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "organisations_template.xlsx");
  };

  /* ── Bulk Import ── */
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rawRows  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const parsed   = rawRows.map(r => ({
        company_name: String(r["Company Name"] || r["company_name"] || "").trim(),
        company_code: String(r["Code"] || r["company_code"] || "").trim().toUpperCase(),
        gstin:        String(r["GSTIN"] || r["gstin"] || "").trim(),
        pan:          String(r["PAN"] || r["pan"] || "").trim(),
        state:        String(r["State"] || r["state"] || "").trim(),
        district:     String(r["District"] || r["district"] || "").trim(),
        pincode:      String(r["Pincode"] || r["pincode"] || "").trim(),
        phone:        String(r["Phone"] || r["phone"] || "").trim(),
        email:        String(r["Email"] || r["email"] || "").trim(),
        status:       String(r["Status"] || "active").toLowerCase().includes("inactive") ? "inactive" : "active",
      })).filter(r => r.company_name);

      if (!parsed.length) { alert("No valid rows found.\nCheck column: Company Name"); return; }

      await Promise.all(parsed.map(r =>
        fetch(`${API}/api/procurement/companies`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
          body: JSON.stringify(r),
        })
      ));
      await fetchCompanies();
      alert(`${parsed.length} organisation(s) imported successfully.`);
    } catch { alert("Failed to read file. Use the template format."); }
    finally { setImporting(false); e.target.value = ""; }
  };

  /* ── expose actions to parent ── */
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = { exportExcel, exportPDF, downloadTemplate, openUpload: () => importRef.current?.click() };
  });

  const closeAdd = () => { setShowAddFlow(false); onAddDone?.(); };
  const handleDataChange = () => { closeAdd(); fetchCompanies(); };

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Importing organisations…</p>
          </div>
        </div>
      )}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading organisations…</div>
      ) : view === "card" ? (
        /* ── Card View ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {companies.map(c => <OrgCard key={c.id} company={c} onOpen={onSelectOrg} />)}
          <AddCard onClick={() => setShowAddFlow(true)} />
        </div>
      ) : (
        /* ── Table View ── */
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap w-14">S.No</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Company Name</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap w-28">Code</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap w-48">GSTIN</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Location</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap w-28">Status</th>
                <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-slate-200 whitespace-nowrap text-center w-28">Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-xs">No organisations yet</td></tr>
              ) : companies.map((c, i) => {
                const name   = c.companyName || c.company_name || "";
                const code   = c.companyCode || c.company_code || "";
                const status = (c.status || "active").toLowerCase();
                const loc    = [c.district, c.state].filter(Boolean).join(", ");
                const td     = "px-4 py-3 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";
                return (
                  <tr key={c.id} className="group">
                    <td className={`${td} text-xs text-slate-400`}>{i + 1}</td>
                    <td className={`${td} font-semibold text-slate-800`}>{name}</td>
                    <td className={`${td} text-blue-600 font-semibold`}>{code}</td>
                    <td className={td}>{c.gstin || "—"}</td>
                    <td className={td}>{loc || "—"}</td>
                    <td className={td}>
                      <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${status === "active" ? "text-emerald-600" : "text-slate-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-200 text-center bg-white group-hover:bg-slate-50 transition-colors">
                      <button onClick={() => onSelectOrg(c)} className="px-3 py-1.5 text-[11px] font-semibold bg-slate-900 text-white rounded hover:bg-blue-600 transition-colors">Open →</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddFlow && (
        <div className="fixed inset-0 z-[90]">
          <CompanyList formOnlyMode autoOpenAdd onDataChange={handleDataChange} onModalClose={closeAdd} />
        </div>
      )}
    </>
  );
}
