import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2 } from "lucide-react";
import { StatusBadge, TableHead } from "./helpers";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useOrgId, scopedUrl } from "./orgScope";
import BrandLoader from "../../components/BrandLoader";
import { FromEmployeesBanner } from "./FromEmployees";
import Pager, { pageOf } from "../Attendance/Pager";

// box table: a line after every column and row
const TH = "px-4 py-2.5 text-left font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
const TD = "px-4 py-2.5 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50 transition-colors";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const TEMPLATE_HEADERS = ["Department Name", "Department Head", "Status"];

function DeptModal({ dept, onClose, onSaved }) {
  const orgId = useOrgId();
  const [form, setForm] = useState(
    dept
      ? { name: dept.name, head: dept.head || "", status: dept.status || "active" }
      : { name: "", head: "", status: "active" }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("Department name is required"); return; }
    setSaving(true); setErr("");
    try {
      const url    = dept ? `${API}/api/departments/${dept.id}` : `${API}/api/departments`;
      const method = dept ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify({ ...form, company_id: orgId }) });
      const json   = await res.json();
      if (!res.ok) { setErr(json.error || "Failed to save"); return; }
      onSaved(json.department);
    } catch { setErr("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-slate-800">{dept ? "Edit Department" : "Add Department"}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Department Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)}
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. HR Department" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Department Head</label>
            <input value={form.head} onChange={e => set("head", e.target.value)}
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. Pooja Sharma" />
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
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {dept ? "Save Changes" : "Add Department"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Departments({ actionsRef, onChange }) {
  const { canAdd, canEdit, canDelete } = useModulePermissions("departments");
  const orgId = useOrgId();
  const [depts, setDepts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [per, setPer]             = useState(50);
  const [modal, setModal]         = useState(null);
  const [deleting, setDeleting]   = useState(null);
  const importRef = useRef(null);


  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch(scopedUrl(`${API}/api/departments`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } });
      const json = await res.json();
      setDepts(json.departments || []);
      onChange?.(json.departments || []); // the count in the page header
    } catch { setDepts([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // register all actions with parent header
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      openAdd:          () => setModal("add"),
      exportExcel:      () => exportExcel(),
      exportPDF:        () => exportPDF(),
      downloadTemplate: () => downloadTemplate(),
      openUpload:       () => importRef.current?.click(),
    };
    return () => { actionsRef.current = {}; };
  });

  const handleSaved = (dept) => {
    setDepts(prev => {
      const exists = prev.find(d => d.id === dept.id);
      return exists ? prev.map(d => d.id === dept.id ? dept : d) : [dept, ...prev];
    });
    setModal(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this department?")) return;
    setDeleting(id);
    try {
      await fetch(`${API}/api/departments/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN()}` } });
      setDepts(prev => prev.filter(d => d.id !== id));
    } catch {}
    finally { setDeleting(null); }
  };

  const rows = depts.filter(d =>
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.code?.toLowerCase().includes(search.toLowerCase()) ||
    d.head?.toLowerCase().includes(search.toLowerCase())
  );
  useEffect(() => { setPage(1); }, [search, per]);
  const pageRows = pageOf(rows, page, per);

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = rows.map((d, i) => ({
      "#": i + 1,
      "Dept ID": d.dept_id || "",
      "Department Name": d.name,
      "Department Head": d.head || "",
      "Status": d.status === "active" ? "Active" : "Inactive",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 24 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Departments");
    XLSX.writeFile(wb, "departments.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Departments", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${rows.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Dept ID", "Department Name", "Head", "Status"]],
      body: rows.map((d, i) => [i + 1, d.dept_id || "—", d.name, d.head || "—", d.status === "active" ? "Active" : "Inactive"]),
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("departments.pdf");
  };

  /* ── Download template ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    ws["!cols"] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(20, h.length + 2) }));
    // an example row
    XLSX.utils.sheet_add_aoa(ws, [[`e.g. HR Dept`, "e.g. Pooja Sharma", "Active"]], { origin: "A2" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Departments");
    XLSX.writeFile(wb, "departments_template.xlsx");
  };

  /* ── Bulk import ── */
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rawRows  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const toImport = rawRows
        .map(r => {
          return {
            name:        String(r["Department Name"] || r["name"] || "").trim(),
            head:        String(r["Department Head"] || r["head"] || "").trim(),
            status:      String(r["Status"] || r["status"] || "active").toLowerCase().includes("inactive") ? "inactive" : "active",
          };
        })
        .filter(r => r.name);

      if (!toImport.length) { alert("No valid rows found in file"); return; }

      let imported = 0, failed = 0;
      for (const row of toImport) {
        const res = await fetch(`${API}/api/departments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
          body: JSON.stringify({ ...row, company_id: orgId }),
        });
        if (res.ok) imported++; else failed++;
      }
      await load();
      alert(`${imported} imported${failed ? `, ${failed} failed` : ""}`);
    } catch (err) {
      alert("Failed to import file");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <>
      {canAdd && <FromEmployeesBanner kind="departments" orgId={orgId} existing={depts.map(d => d.name)} onAdded={load} />}
      {importing && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <BrandLoader compact />
            <p className="text-slate-700 font-semibold text-sm">Importing departments…</p>
          </div>
        </div>
      )}

      {/* Search on top, column names stick, rows scroll, pager stays at the bottom */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ height: "calc(100svh - 120px)", minHeight: 360 }}>
        <div className="shrink-0 flex items-center px-4 py-3 border-b border-slate-200">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search departments…"
              className="pl-8 pr-3 h-8 text-xs border border-slate-200 rounded-md bg-slate-50 w-60 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white" />
          </div>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className={`${TH} w-32`}>Dept ID</th>
                <th className={TH}>Department Name</th>
                <th className={TH}>Head</th>
                <th className={`${TH} w-28 text-center`}>Status</th>
                <th className={`${TH} w-24 text-center border-r-0`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10"><BrandLoader compact /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-xs border-b border-slate-200">
                  {search ? "No departments match your search" : "No departments yet — add one above"}
                </td></tr>
              ) : pageRows.map(d => (
                <tr key={d.id} className="group">
                  <td className={`${TD} text-slate-500 text-[13px] tabular-nums`}>{d.dept_id || "—"}</td>
                  <td className={`${TD} font-semibold text-slate-800`}>{d.name}</td>
                  <td className={`${TD} text-slate-600`}>{d.head || "—"}</td>
                  <td className={`${TD} text-center`}><StatusBadge active={d.status === "active"} /></td>
                  <td className={`${TD} border-r-0`}>
                    <div className="flex items-center justify-center gap-1">
                      {canEdit && (
                        <button onClick={() => setModal(d)} title="Edit"
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Edit2 size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(d.id)} disabled={deleting === d.id} title="Delete"
                          className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          {deleting === d.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={rows.length} page={page} per={per} onPage={setPage} onPer={setPer} />
      </div>

      {modal && (
        <DeptModal
          dept={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
