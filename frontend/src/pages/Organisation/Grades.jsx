import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2, ChevronUp, ChevronDown, Plus } from "lucide-react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { StatusBadge } from "./helpers";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";
const mapGrade = (g) => ({ ...g, gradeId: g.grade_id || g.gradeId, order: g.sort_order ?? g.order ?? 1 });

const ALL_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

const sortByGrade = (arr) =>
  [...arr].sort((a, b) => (a.grade || "").localeCompare(b.grade || ""));

export const parseDescriptions = (val) => {
  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
  if (!val) return [];
  return String(val).split(",").map(s => s.trim()).filter(Boolean);
};

export const descriptionsLabel = (g) => parseDescriptions(g?.descriptions ?? g?.description).join(", ");

const normalizeGrade = (g, i) => {
  const descriptions = parseDescriptions(g.descriptions ?? g.description);
  const { description, ...rest } = g;
  return {
    ...rest,
    id: g.id ?? g.gradeId ?? `grade-${g.grade || i}`,
    order: Number(g.order) || i + 1,
    descriptions,
  };
};


/* colour by alphabetical position of the grade letter */
const GRADE_PALETTE = [
  "bg-slate-100 text-slate-600",
  "bg-blue-100 text-blue-700",
  "bg-teal-100 text-teal-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-red-100 text-red-700",
];
export const gradeCls = (letter) =>
  GRADE_PALETTE[((letter?.toUpperCase().charCodeAt(0) || 65) - 65) % GRADE_PALETTE.length];

function DescriptionChips({ descriptions }) {
  const items = parseDescriptions(descriptions);
  if (!items.length) return <span className="text-slate-300 italic font-normal text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((d, i) => (
        <span
          key={`${d}-${i}`}
          className="inline-flex items-center px-2.5 py-1 rounded border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function DescriptionTagsInput({ descriptions, onChange }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim();
    if (!tag) return;
    if (descriptions.some(d => d.toLowerCase() === tag.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...descriptions, tag]);
    setInput("");
  };

  const removeTag = (idx) => onChange(descriptions.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {descriptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-slate-200 rounded bg-slate-50/50">
          {descriptions.map((d, i) => (
            <span
              key={`${d}-${i}`}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-700"
            >
              {d}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                aria-label={`Remove ${d}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); addTag(); }
          }}
          placeholder="e.g. Director — press Enter or Add"
          className="flex-1 border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50 flex items-center gap-1 shrink-0"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
      <p className="text-[10px] text-slate-400">Add each title separately — they appear as individual boxes</p>
    </div>
  );
}

function Modal({ item, usedLetters, onClose, onSaved }) {
  const available = ALL_LETTERS.filter(l => l === item?.grade || !usedLetters.includes(l));
  const [form, setForm] = useState(
    item
      ? { grade: item.grade, descriptions: parseDescriptions(item.descriptions ?? item.description), status: item.status }
      : { grade: available[0] || "A", descriptions: [], status: "active" }
  );
  const [err, setErr] = useState("");

  const save_ = () => {
    if (!form.grade) { setErr("Grade is required"); return; }
    if (!form.descriptions.length) { setErr("Add at least one description"); return; }
    onSaved({ grade: form.grade, descriptions: form.descriptions, status: form.status });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-slate-800">{item ? "Edit Grade" : "Add Grade"}</p>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>

        <div className="space-y-3">

          {/* Grade + Status — same row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Grade *</label>
              {item ? (
                <div className="flex items-center gap-2 h-[38px]">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-black ${gradeCls(form.grade)}`}>
                    {form.grade}
                  </span>
                  <span className="text-xs text-slate-400">Cannot be changed</span>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <select
                      value={form.grade}
                      onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                      autoFocus
                      className="w-full appearance-none border border-slate-200 rounded px-3 py-2 pr-8 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                      {available.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{available.length} of 26 remaining</p>
                </>
              )}
            </div>

            <div className="w-36">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
              <div className="relative">
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full appearance-none border border-slate-200 rounded px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Descriptions *</label>
            <DescriptionTagsInput
              descriptions={form.descriptions}
              onChange={descriptions => setForm(f => ({ ...f, descriptions }))}
            />
          </div>

        </div>

        {err && <p className="text-red-500 text-xs mt-3">{err}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save_} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            {item ? "Save Changes" : "Add Grade"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Grades({ actionsRef, onChange }) {
  const { canEdit, canDelete } = useModulePermissions("grades");
  const [grades,       setGrades]       = useState([]);
  const [search,       setSearch]       = useState("");
  const [modal,        setModal]        = useState(null);
  const [importing,    setImporting]    = useState(false);
  const [editingOrder, setEditingOrder] = useState(false);
  const [draftGrades,  setDraftGrades]  = useState([]);
  const [draftSortDir, setDraftSortDir]  = useState("asc");
  const importRef = useRef(null);

  const fetchGrades = async () => {
    const res = await fetch(`${API}/api/organisation/grades`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    const d   = await res.json();
    const arr = sortByGrade((d.grades || []).map(mapGrade));
    setGrades(arr); onChange?.(arr);
  };
  useEffect(() => { fetchGrades(); }, []);

  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      openAdd:          () => {
        if (grades.length >= 26) { alert("All 26 grades (A–Z) have already been defined."); return; }
        setModal("add");
      },
      exportExcel:      exportExcel,
      exportPDF:        exportPDF,
      downloadTemplate: downloadTemplate,
      openUpload:       () => importRef.current?.click(),
    };
    return () => { actionsRef.current = {}; };
  });

  const handleSaved = async (form) => {
    const isAdd = modal === "add";
    const maxOrder = grades.length ? Math.max(...grades.map(g => g.order || 0)) : 0;
    const body = isAdd ? { grade: form.grade, descriptions: form.descriptions, sort_order: maxOrder + 1, status: form.status }
                       : { descriptions: form.descriptions, status: form.status };
    const url = isAdd ? `${API}/api/organisation/grades` : `${API}/api/organisation/grades/${modal.id}`;
    await fetch(url, { method: isAdd ? "POST" : "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify(body) });
    setModal(null);
    fetchGrades();
  };

  const del = async (id) => {
    if (!window.confirm("Delete this grade?")) return;
    await fetch(`${API}/api/organisation/grades/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN()}` } });
    fetchGrades();
  };

  /* Rows stay fixed — only order numbers change: asc 1,2,3… or desc n,…,1 */
  const orderForIndex = (index, total, dir) =>
    dir === "asc" ? index + 1 : total - index;

  const applyDraftSort = (dir) => setDraftSortDir(dir);

  const startEditOrder = () => {
    setDraftSortDir("asc");
    setDraftGrades(sortByGrade(grades));
    setEditingOrder(true);
  };

  const saveOrder = async () => {
    const n = draftGrades.length;
    await Promise.all(draftGrades.map((g, i) =>
      fetch(`${API}/api/organisation/grades/${g.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify({ sort_order: orderForIndex(i, n, draftSortDir) }) })
    ));
    setEditingOrder(false); setDraftGrades([]); setDraftSortDir("asc");
    fetchGrades();
  };

  const cancelOrder = () => {
    setEditingOrder(false);
    setDraftGrades([]);
    setDraftSortDir("asc");
  };

  const usedLetters = grades.map(g => g.grade);

  const matchesSearch = (g) => {
    const q = search.toLowerCase();
    if (!q) return true;
    if (g.grade?.toUpperCase().includes(search.toUpperCase())) return true;
    return parseDescriptions(g.descriptions).some(d => d.toLowerCase().includes(q));
  };

  const rows = (editingOrder ? draftGrades : sortByGrade(grades)).filter(
    g => editingOrder || matchesSearch(g)
  );

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = rows.map((g, i) => ({
      "#":           i + 1,
      "Grade ID":    g.gradeId || "",
      "Grade":       g.grade,
      "Description":  descriptionsLabel(g),
      "Order":       g.order,
      "Status":      g.status === "active" ? "Active" : "Inactive",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grades");
    XLSX.writeFile(wb, "grades.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Grades", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${rows.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head:  [["#", "Grade ID", "Grade", "Description", "Order", "Status"]],
      body:  rows.map((g, i) => [i + 1, g.gradeId || "—", g.grade, descriptionsLabel(g) || "—", g.order, g.status === "active" ? "Active" : "Inactive"]),
      styles:            { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles:        { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles:{ fillColor: [248, 250, 252] },
      columnStyles:      { 0: { halign: "center", cellWidth: 10 }, 2: { halign: "center", cellWidth: 16 }, 4: { halign: "center", cellWidth: 16 }, 5: { halign: "center", cellWidth: 22 } },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("grades.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Grade", "Description", "Status"],
      ["A", "MD",                         "Active"],
      ["B", "Director, Senior VP, VP",    "Active"],
      ["C", "Senior Manager, Head, Associate VP", "Active"],
      ["D", "Manager",              "Active"],
      ["E", "Senior Engineer",      "Active"],
      ["F", "Executive",            "Active"],
      ["G", "Trainee / Entry",      "Active"],
      ["", "", ""],
      ["Grade: A–Z  |  Description: comma-separated titles  |  Status: Active / Inactive", "", ""],
    ]);
    ws["!cols"] = [{ wch: 8 }, { wch: 22 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grades");
    XLSX.writeFile(wb, "grades_template.xlsx");
  };

  /* ── Bulk Import ── */
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rawRows  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const existing = new Set(grades.map(g => g.grade));
      const parsed   = rawRows
        .map(r => ({
          grade:        String(r["Grade"] || r["grade"] || "").trim().toUpperCase().charAt(0),
          descriptions: parseDescriptions(r["Description"] || r["description"] || ""),
          status:       String(r["Status"] || "active").toLowerCase().includes("inactive") ? "inactive" : "active",
        }))
        .filter(r => /^[A-Z]$/.test(r.grade) && r.descriptions.length && !existing.has(r.grade));

      if (!parsed.length) { alert("No valid new grades found.\nMake sure columns are: Grade, Description, Status (no duplicate letters)"); return; }

      let maxOrder = grades.length ? Math.max(...grades.map(g => g.order || 0)) : 0;
      await Promise.all(parsed.map((r, i) =>
        fetch(`${API}/api/organisation/grades`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify({ ...r, sort_order: maxOrder + i + 1 }) })
      ));
      await fetchGrades();
      alert(`${parsed.length} grade(s) imported successfully.`);
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
            <p className="text-slate-700 font-semibold text-sm">Importing grades…</p>
          </div>
        </div>
      )}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search grades…"
              disabled={editingOrder}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50" />
          </div>
          {editingOrder ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 font-medium mr-1">Set order numbers — grades stay in place</span>
              <button onClick={cancelOrder}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveOrder}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                Save Order
              </button>
            </div>
          ) : canEdit && (
            <button onClick={startEditOrder}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-50 hover:border-slate-300 flex items-center gap-1.5">
              <Edit2 size={12} />
              Edit Order
            </button>
          )}
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
              <th className="px-4 py-3 text-left font-semibold w-14">S.No</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Grade ID</th>
              <th className="px-4 py-3 text-center font-semibold w-20">Grade</th>
              <th className="px-4 py-3 text-left font-semibold">Description</th>
              <th className={`px-4 py-3 text-center font-semibold w-32 ${editingOrder ? "bg-amber-100 text-amber-800" : ""}`}>
                {editingOrder ? (
                  <span className="inline-flex items-center justify-center gap-1">
                    Order
                    <button
                      type="button"
                      onClick={() => applyDraftSort("asc")}
                      title="Ascending order numbers: 1, 2, 3…"
                      className={`p-0.5 rounded transition-colors ${
                        draftSortDir === "asc"
                          ? "bg-amber-200 text-amber-900"
                          : "text-amber-700 hover:bg-amber-200/70"
                      }`}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDraftSort("desc")}
                      title="Descending order numbers: 3, 2, 1…"
                      className={`p-0.5 rounded transition-colors ${
                        draftSortDir === "desc"
                          ? "bg-amber-200 text-amber-900"
                          : "text-amber-700 hover:bg-amber-200/70"
                      }`}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </span>
                ) : (
                  "Order"
                )}
              </th>
              <th className="px-4 py-3 text-center font-semibold w-28">Status</th>
              <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                {search ? "No grades match your search" : "No grades yet — add one above"}
              </td></tr>
            ) : rows.map((g, i) => (
              <tr key={g.id} className={`transition-colors ${editingOrder ? "bg-amber-50/40 hover:bg-amber-50" : "hover:bg-slate-50"}`}>
                <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3">
                  <span className="text-slate-500 text-[13px] font-mono">{g.gradeId}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-black ${gradeCls(g.grade)}`}>
                    {g.grade}
                  </span>
                </td>
                <td className="px-4 py-3"><DescriptionChips descriptions={g.descriptions} /></td>
                <td className={`px-4 py-3 text-center ${editingOrder ? "bg-amber-50" : ""}`}>
                  <span className={`text-xs font-bold tabular-nums ${editingOrder ? "text-amber-900" : "text-slate-700"}`}>
                    {editingOrder ? orderForIndex(i, rows.length, draftSortDir) : g.order}
                  </span>
                </td>
                <td className="px-4 py-3 text-center"><StatusBadge active={g.status === "active"} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <button onClick={() => setModal(g)} disabled={editingOrder}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                        <Edit2 size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => del(g.id)} disabled={editingOrder}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                        <Trash2 size={13} />
                      </button>
                    )}
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
          usedLetters={usedLetters}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

export const loadGrades = () => [];
