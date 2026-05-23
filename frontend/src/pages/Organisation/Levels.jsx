import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2 } from "lucide-react";
import { StatusBadge } from "./helpers";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STORAGE_KEY = "bms_org_levels";

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const save = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

const nextLvlId = (arr) => {
  const nums = arr.map(d => parseInt((d.lvlId || "LVL-000").replace("LVL-", ""), 10)).filter(n => !isNaN(n));
  return `LVL-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
};

function Modal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(
    item
      ? { name: item.name, order: String(item.order), status: item.status }
      : { name: "", order: "", status: "active" }
  );
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save_ = () => {
    if (!form.name.trim()) { setErr("Level name is required"); return; }
    const ord = Number(form.order);
    if (!form.order || isNaN(ord) || ord < 1) { setErr("Order must be a positive number"); return; }
    onSaved({ name: form.name.trim(), order: ord, status: form.status });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-slate-800">{item ? "Edit Level" : "Add Level"}</p>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Level Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. Executive" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Order *</label>
            <input type="number" min="1" value={form.order} onChange={e => set("order", e.target.value)}
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. 1" />
            <p className="text-[10px] text-slate-400 mt-1">1 = lowest (entry level), higher number = more senior</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {err && <p className="text-red-500 text-xs mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save_} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            {item ? "Save Changes" : "Add Level"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Levels({ actionsRef, onChange }) {
  const [levels,    setLevels]    = useState(load);
  const [search,    setSearch]    = useState("");
  const [modal,     setModal]     = useState(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef(null);

  const persist = (data) => { setLevels(data); save(data); onChange?.(data); };

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

  const handleSaved = (form) => {
    if (modal === "add") {
      persist([...levels, { id: Date.now(), lvlId: nextLvlId(levels), ...form }]);
    } else {
      persist(levels.map(l => l.id === modal.id ? { ...l, ...form } : l));
    }
    setModal(null);
  };

  const del = (id) => {
    if (!window.confirm("Delete this level?")) return;
    persist(levels.filter(l => l.id !== id));
  };

  const rows = [...levels]
    .filter(l => l.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.order - b.order);

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = rows.map((l, i) => ({
      "#":          i + 1,
      "Level ID":   l.lvlId || "",
      "Level Name": l.name,
      "Order":      l.order,
      "Status":     l.status === "active" ? "Active" : "Inactive",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Levels");
    XLSX.writeFile(wb, "levels.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Levels", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${rows.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head:  [["#", "Level ID", "Level Name", "Order", "Status"]],
      body:  rows.map((l, i) => [i + 1, l.lvlId || "—", l.name, l.order, l.status === "active" ? "Active" : "Inactive"]),
      styles:            { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles:        { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles:{ fillColor: [248, 250, 252] },
      columnStyles:      { 0: { halign: "center", cellWidth: 12 }, 3: { halign: "center", cellWidth: 20 }, 4: { halign: "center", cellWidth: 24 } },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("levels.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Level Name", "Order", "Status"],
      ["Trainee",          "1", "Active"],
      ["Junior",           "2", "Active"],
      ["Executive",        "3", "Active"],
      ["Senior Executive", "4", "Active"],
      ["Manager",          "5", "Active"],
      ["", "", ""],
      ["Valid status: Active / Inactive  |  Order: 1 = entry level, higher = more senior", "", ""],
    ]);
    ws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Levels");
    XLSX.writeFile(wb, "levels_template.xlsx");
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
          name:   String(r["Level Name"] || r["name"] || "").trim(),
          order:  Number(r["Order"] || r["order"] || 0),
          status: String(r["Status"] || "active").toLowerCase().includes("inactive") ? "inactive" : "active",
        }))
        .filter(r => r.name && r.order > 0);

      if (!parsed.length) { alert("No valid rows found.\nMake sure columns are: Level Name, Order, Status"); return; }

      const updated = [...levels];
      parsed.forEach(r => {
        updated.push({ id: Date.now() + Math.random(), lvlId: nextLvlId(updated), ...r });
      });
      persist(updated);
      alert(`${parsed.length} level(s) imported successfully.`);
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
            <p className="text-slate-700 font-semibold text-sm">Importing levels…</p>
          </div>
        </div>
      )}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search levels…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
              <th className="px-4 py-3 text-left font-semibold w-14">S.No</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Level ID</th>
              <th className="px-4 py-3 text-left font-semibold">Level Name</th>
              <th className="px-4 py-3 text-center font-semibold w-24">Order</th>
              <th className="px-4 py-3 text-center font-semibold w-28">Status</th>
              <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                {search ? "No levels match your search" : "No levels yet — add one above"}
              </td></tr>
            ) : rows.map((l, i) => (
              <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3">
                  <span className="text-slate-500 text-[13px] font-mono">{l.lvlId}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800">{l.name}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                    {l.order}
                  </span>
                </td>
                <td className="px-4 py-3 text-center"><StatusBadge active={l.status === "active"} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setModal(l)}
                      className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => del(l.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          item={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

export { load as loadLevels };
