import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2 } from "lucide-react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { StatusBadge } from "./helpers";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

function Modal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { name: item.name, status: item.status } : { name: "", status: "active" });
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save_ = () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    onSaved(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-slate-800">{item ? "Edit Division" : "Add Division"}</p>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Division Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. Engineering" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center]">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {err && <p className="text-red-500 text-xs mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save_} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            {item ? "Save Changes" : "Add Division"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Divisions({ actionsRef, onChange }) {
  const { canEdit, canDelete } = useModulePermissions("divisions");
  const [divs, setDivs]           = useState([]);
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef(null);

  const fetchDivs = async () => {
    const res = await fetch(`${API}/api/organisation/divisions`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    const d   = await res.json();
    const arr = d.divisions || [];
    setDivs(arr); onChange?.(arr);
  };
  useEffect(() => { fetchDivs(); }, []);

  /* ── actionsRef wiring ── */
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      openAdd:          () => setModal("add"),
      exportExcel:      exportExcel,
      exportPDF:        exportPDF,
      downloadTemplate: downloadTemplate,
      openUpload:       () => importRef.current?.click(),
    };
    return () => { actionsRef.current = {}; };
  });

  const handleSaved = async (form) => {
    const isAdd = modal === "add";
    const url    = isAdd ? `${API}/api/organisation/divisions` : `${API}/api/organisation/divisions/${modal.id}`;
    await fetch(url, { method: isAdd ? "POST" : "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify(form) });
    setModal(null);
    fetchDivs();
  };

  const del = async (id) => {
    if (!window.confirm("Delete this division?")) return;
    await fetch(`${API}/api/organisation/divisions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN()}` } });
    fetchDivs();
  };

  const rows = divs.filter(d => d.name?.toLowerCase().includes(search.toLowerCase()));

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = rows.map((d, i) => ({
      "#":             i + 1,
      "Div ID":        d.div_id || "",
      "Division Name": d.name,
      "Status":        d.status === "active" ? "Active" : "Inactive",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Divisions");
    XLSX.writeFile(wb, "divisions.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Divisions", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${rows.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Div ID", "Division Name", "Status"]],
      body: rows.map((d, i) => [i + 1, d.div_id || "—", d.name, d.status === "active" ? "Active" : "Inactive"]),
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { halign: "center", cellWidth: 12 }, 3: { halign: "center", cellWidth: 24 } },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("divisions.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Division Name", "Status"],
      ["Engineering", "Active"],
      ["", ""],
      ["Valid status: Active / Inactive", ""],
    ]);
    ws["!cols"] = [{ wch: 28 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Divisions");
    XLSX.writeFile(wb, "divisions_template.xlsx");
  };

  /* ── Bulk Import ── */
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rawRows  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const parsed   = rawRows
        .map(r => ({
          name:   String(r["Division Name"] || r["name"] || "").trim(),
          status: String(r["Status"] || "active").toLowerCase().includes("inactive") ? "inactive" : "active",
        }))
        .filter(r => r.name);

      if (!parsed.length) { alert("No valid rows found.\nMake sure column is: Division Name"); return; }

      await Promise.all(parsed.map(r =>
        fetch(`${API}/api/organisation/divisions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify(r) })
      ));
      await fetchDivs();
      alert(`${parsed.length} division(s) imported successfully.`);
    } catch {
      alert("Failed to read file. Please use the template format.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Importing divisions…</p>
          </div>
        </div>
      )}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search divisions…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
              <th className="px-4 py-3 text-left font-semibold w-14">S.No</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Div ID</th>
              <th className="px-4 py-3 text-left font-semibold">Division Name</th>
              <th className="px-4 py-3 text-center font-semibold w-28">Status</th>
              <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                {search ? "No divisions match your search" : "No divisions yet — add one above"}
              </td></tr>
            ) : rows.map((d, i) => (
              <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3"><span className="text-slate-500 text-[13px]">{d.div_id}</span></td>
                <td className="px-4 py-3 font-semibold text-slate-800">{d.name}</td>
                <td className="px-4 py-3 text-center"><StatusBadge active={d.status === "active"} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && <button onClick={() => setModal(d)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 size={13} /></button>}
                    {canDelete && <button onClick={() => del(d.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <Modal item={modal === "add" ? null : modal} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </>
  );
}

export const loadDivisions = () => [];
