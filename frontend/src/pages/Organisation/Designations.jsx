import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { StatusBadge, TableHead, cx } from "./helpers";
import { gradeCls, parseDescriptions } from "./Grades";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";
const mapDesig = (d) => ({ ...d, desigId: d.desig_id || d.desigId, active: d.status !== undefined ? d.status === "active" : !!d.active });
const TEMPLATE_HEADERS = ["Designation Name", "Grade", "Status"];
const EMPTY_FORM = { title: "", grade: "", active: true };

export default function Designations({ actionsRef }) {
  const { canEdit, canDelete } = useModulePermissions("designations");
  const [rows,      setRows]      = useState([]);
  const [grades,    setGrades]    = useState([]);
  const [search,    setSearch]    = useState("");
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formErr,   setFormErr]   = useState("");
  const [deleteId,      setDeleteId]      = useState(null);
  const [importing,     setImporting]     = useState(false);
  const [gradeDropOpen, setGradeDropOpen] = useState(false);
  const [viewGrade,     setViewGrade]     = useState(null);
  const importRef   = useRef(null);
  const gradeDropRef = useRef(null);

  const fetchDesigs = async () => {
    const res = await fetch(`${API}/api/organisation/org-designations`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    const d   = await res.json();
    setRows((d.designations || []).map(mapDesig));
  };
  useEffect(() => { fetchDesigs(); }, []);

  useEffect(() => {
    fetch(`${API}/api/organisation/grades`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json())
      .then(d => setGrades((d.grades || []).map(g => ({ ...g, gradeId: g.grade_id || g.gradeId, order: g.sort_order ?? g.order ?? 1 })).filter(g => g.status === "active").sort((a, b) => (a.order || 0) - (b.order || 0))));
  }, []);

  useEffect(() => {
    if (!gradeDropOpen) return;
    const handler = (e) => {
      if (gradeDropRef.current && !gradeDropRef.current.contains(e.target)) setGradeDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [gradeDropOpen]);

  const filtered = rows.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.desigId || "").toLowerCase().includes(search.toLowerCase())
  );

  /* ── actionsRef wiring ── */
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      openAdd:          () => { setForm(EMPTY_FORM); setFormErr(""); setModal({ mode: "add" }); },
      exportExcel:      exportExcel,
      exportPDF:        exportPDF,
      downloadTemplate: downloadTemplate,
      openUpload:       () => importRef.current?.click(),
    };
    return () => { actionsRef.current = {}; };
  });

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = filtered.map((d, i) => ({
      "#":                i + 1,
      "Desig ID":         d.desigId,
      "Designation Name": d.title,
      "Grade":            d.grade || "",
      "Status":           d.active ? "Active" : "Inactive",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Designations");
    XLSX.writeFile(wb, "designations.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Designations", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Desig ID", "Designation Name", "Grade", "Status"]],
      body: filtered.map((d, i) => [i + 1, d.desigId, d.title, d.grade || "—", d.active ? "Active" : "Inactive"]),
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { halign: "center", cellWidth: 10 }, 1: { cellWidth: 28 }, 3: { halign: "center", cellWidth: 18 }, 4: { halign: "center", cellWidth: 22 } },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("designations.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const gradeHint = grades.length ? grades.map(g => g.grade).join(", ") : "Add grades in the Grades tab first";
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ["Site Engineer", grades[0]?.grade || "A", "Active"],
      ["", "", ""],
      [`Valid grades: ${gradeHint}`, "", "Valid status: Active / Inactive"],
    ]);
    ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Designations");
    XLSX.writeFile(wb, "designations_template.xlsx");
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
          title:  String(r["Designation Name"] || r["title"] || "").trim(),
          grade:  String(r["Grade"]            || r["grade"] || "").trim().toUpperCase().charAt(0),
          active: !String(r["Status"] || "active").toLowerCase().includes("inactive"),
        }))
        .filter(r => r.title);

      if (!parsed.length) { alert("No valid rows found.\nMake sure columns are: Designation Name, Grade, Status"); return; }

      await Promise.all(parsed.map(r =>
        fetch(`${API}/api/organisation/org-designations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
          body: JSON.stringify({ title: r.title, grade: r.grade, status: r.active ? "active" : "inactive" }),
        })
      ));
      await fetchDesigs();
      alert(`${parsed.length} designation(s) imported successfully.`);
    } catch {
      alert("Failed to read file. Please use the template format.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  /* ── Modal save ── */
  const handleSave = async () => {
    if (!form.title.trim()) { setFormErr("Designation name is required."); return; }
    const payload = { title: form.title.trim(), grade: form.grade, status: form.active ? "active" : "inactive" };
    const isAdd = modal.mode === "add";
    const url = isAdd ? `${API}/api/organisation/org-designations` : `${API}/api/organisation/org-designations/${modal.data.id}`;
    await fetch(url, { method: isAdd ? "POST" : "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify(payload) });
    setModal(null);
    fetchDesigs();
  };

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Importing designations…</p>
          </div>
        </div>
      )}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search designations…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <TableHead cols={[
            { label: "S.No",             center: true },
            { label: "Desig ID" },
            { label: "Designation Name" },
            { label: "Grade",  center: true },
            { label: "Status", center: true },
            { label: "" },
          ]} />
          <tbody className="divide-y divide-slate-100">
            {filtered.map((d, i) => (
              <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-center text-xs text-slate-400">{i + 1}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.desigId}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{d.title}</td>
                <td className="px-4 py-3 text-center">
                  {d.grade
                    ? <span className={cx("inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-black", gradeCls(d.grade))}>{d.grade}</span>
                    : <span className="text-slate-300 text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-center"><StatusBadge active={d.active} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <button
                        onClick={() => { setForm({ title: d.title, grade: d.grade || "", active: d.active }); setFormErr(""); setModal({ mode: "edit", data: d }); }}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Edit2 size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeleteId(d.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">No designations found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl w-[400px] border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-[14px] font-bold text-slate-800">
                {modal.mode === "add" ? "Add Designation" : "Edit Designation"}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700"><X size={15} /></button>
            </div>

            <div className="px-5 py-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Designation Name</label>
                <input
                  value={form.title}
                  onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setFormErr(""); }}
                  placeholder="e.g. Site Engineer"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {formErr && <p className="text-[11px] text-red-500 mt-1">{formErr}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Grade</label>
                {grades.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1" ref={gradeDropRef}>
                      {/* Trigger */}
                      <button
                        type="button"
                        onClick={() => setGradeDropOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                        {form.grade
                          ? <span className="font-semibold text-slate-800">{form.grade}</span>
                          : <span className="text-slate-400">— Select Grade —</span>}
                        <ChevronDown size={14} className={cx("text-slate-400 transition-transform", gradeDropOpen && "rotate-180")} />
                      </button>

                      {/* Dropdown list */}
                      {gradeDropOpen && (
                        <div className="absolute z-[70] w-full mt-1 bg-white border border-slate-200 rounded shadow-lg overflow-hidden">
                          <div
                            onClick={() => { setForm(f => ({ ...f, grade: "" })); setGradeDropOpen(false); }}
                            className="px-3 py-2 text-sm text-slate-400 cursor-pointer hover:bg-slate-50 border-b border-slate-100">
                            — Select Grade —
                          </div>
                          {grades.map(g => (
                            <div key={g.id} className="flex items-center group hover:bg-slate-50 cursor-pointer">
                              <div
                                onClick={() => { setForm(f => ({ ...f, grade: g.grade })); setGradeDropOpen(false); }}
                                className="flex items-center gap-2.5 flex-1 px-3 py-2.5">
                                <span className={cx("inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black shrink-0", gradeCls(g.grade))}>
                                  {g.grade}
                                </span>
                                <span className="text-sm text-slate-700 font-medium">{g.gradeId || `Grade ${g.grade}`}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setViewGrade(g); setGradeDropOpen(false); }}
                                className="p-2 mr-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                                title="View grade details">
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {form.grade && (
                      <span className={cx("inline-flex items-center justify-center w-10 h-10 rounded-full text-lg font-black shrink-0", gradeCls(form.grade))}>
                        {form.grade}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded">
                    No grades defined yet — add grades in the <strong>Grades</strong> tab first.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Status</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={cx("relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0", form.active ? "bg-emerald-500" : "bg-slate-300")}>
                  <span className={cx("inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform", form.active ? "translate-x-[18px]" : "translate-x-0.5")} />
                </button>
                <span className="text-xs text-slate-500">{form.active ? "Active" : "Inactive"}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
              <button onClick={() => setModal(null)}
                className="px-4 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                {modal.mode === "add" ? "Add Designation" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl w-[340px] border border-slate-200">
            <div className="px-5 py-5">
              <p className="text-[14px] font-semibold text-slate-800 mb-1">Delete Designation</p>
              <p className="text-xs text-slate-500">Are you sure? This cannot be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-1.5 text-xs font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={async () => {
                await fetch(`${API}/api/organisation/org-designations/${deleteId}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN()}` } });
                setDeleteId(null);
                fetchDesigs();
              }} className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grade Detail Side Panel */}
      {viewGrade && (
        <>
          <div className="fixed inset-0 z-[55] bg-black/20" onClick={() => setViewGrade(null)} />
          <div className="fixed inset-y-0 right-0 z-[60] w-72 bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Grade Details</h3>
              <button onClick={() => setViewGrade(null)} className="text-slate-400 hover:text-slate-700"><X size={15} /></button>
            </div>
            <div className="px-5 py-5 flex flex-col gap-5 overflow-y-auto">
              <div className="flex items-center gap-4">
                <span className={cx("inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-black shrink-0", gradeCls(viewGrade.grade))}>
                  {viewGrade.grade}
                </span>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Grade ID</p>
                  <p className="text-sm font-mono font-bold text-slate-700">{viewGrade.gradeId || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Descriptions</p>
                {parseDescriptions(viewGrade.descriptions).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parseDescriptions(viewGrade.descriptions).map((d, i) => (
                      <span key={i} className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">{d}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No descriptions added</span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Status</p>
                  <StatusBadge active={viewGrade.status === "active"} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Order</p>
                  <p className="text-sm font-bold text-slate-700">{viewGrade.order ?? "—"}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export const loadDesignations = () => [];
