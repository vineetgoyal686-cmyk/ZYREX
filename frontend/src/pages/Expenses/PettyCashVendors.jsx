import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Search, Pencil, X, Loader2, Store, GitMerge, Plus, Trash2, FileSpreadsheet, UploadCloud, Download, ChevronDown, IndianRupee, Receipt, Clock3 } from "lucide-react";
import api from "../../utils/api";
import Pagination from "./Pagination";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { GRID_TABLE, fmtAmount, fmtDate, apiError } from "./pettyCashConstants";
import BrandLoader from "../../components/BrandLoader";

// Directory tab: vendors per project / office — the names typed on expense
// entries plus those added here (Add / Excel), same name in any case /
// spacing = one vendor, with what was spent. Rename fixes a name on all that
// project's entries; renaming to a name the project already has merges the
// two. A vendor no expense uses can be deleted.
const keyOf = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

// scope = { company, project (null = all), projects, kind, kindLabel } from the Petty Cash header
export default function PettyCashVendors({ scope }) {
  const { canAdd, canEdit, canDelete, canBulk, canExport: canExportStaff } = useModulePermissions("petty_cash_staff");
  const { canExport: canExportAccounts } = useModulePermissions("petty_cash_accounts");
  const canExport = canExportStaff || canExportAccounts;
  const [adding, setAdding]     = useState(false);
  const [deleting, setDeleting] = useState(null); // vendor row
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting]   = useState(false);
  const [importResult, setImportResult] = useState(null); // { added, skipped }
  const fileRef = useRef(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [renaming, setRenaming] = useState(null); // vendor row
  const [viewing, setViewing]   = useState(null); // vendor row
  const [toast, setToast]       = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/petty-cash/vendor-directory", {
        params: { company_id: scope.company.id, kind: scope.kind, project_id: scope.project?.id || undefined },
      });
      setVendors(data.vendors || []);
    } catch (err) { setError(apiError(err, "Failed to load vendors")); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const projectName = (id) => scope.projects.find(p => p.id === id)?.name || "—";
  const showProject = !scope.project;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? vendors.filter(v => v.name.toLowerCase().includes(q) || (showProject && projectName(v.projectId).toLowerCase().includes(q))) : vendors;
  }, [vendors, search]);

  const totalSpend = filtered.reduce((s, v) => s + v.total, 0);
  const showActions = canEdit || canDelete;
  const headers = ["Vendor", ...(showProject ? [scope.kindLabel] : []), "Entries", "Total Spend", "Last Used", ...(showActions ? ["Action"] : [])];
  const fileTag = [scope.company.code, scope.project?.code || scope.project?.name].filter(Boolean).join("_").replace(/[^a-zA-Z0-9_-]+/g, "_");

  // ── Excel ────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = filtered.map(v => ({
      "Vendor Name": v.name, [scope.kindLabel]: projectName(v.projectId), Entries: v.entries,
      "Total Spend": v.total, "Last Used": v.lastUsed ? fmtDate(v.lastUsed) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 34 }, { wch: 30 }, { wch: 9 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, `petty_cash_vendors${fileTag ? `_${fileTag}` : ""}.xlsx`);
  };

  // Project / Office column: code or name; may be left blank when one
  // project / office is picked at the top
  const downloadTemplate = () => {
    const sample = scope.projects[0];
    const ws = XLSX.utils.aoa_to_sheet([
      ["Vendor Name", scope.kindLabel],
      ["Sharma Hardware", scope.project?.code || scope.project?.name || sample?.code || sample?.name || ""],
    ]);
    ws["!cols"] = [{ wch: 34 }, { wch: 30 }];
    const opts = XLSX.utils.aoa_to_sheet([
      [`${scope.kindLabel}s of ${scope.company.name} — write the code or the name`],
      ["Code", "Name"],
      ...scope.projects.map(p => [p.code || "", p.name]),
      [],
      [scope.project ? `Blank ${scope.kindLabel} = ${scope.project.name} (picked at the top)` : `${scope.kindLabel} is required on every row`],
    ]);
    opts["!cols"] = [{ wch: 16 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.utils.book_append_sheet(wb, opts, `${scope.kindLabel}s`);
    XLSX.writeFile(wb, "petty_cash_vendors_template.xlsx");
  };

  const uploadExcel = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const pick = (r, ...names) => {
        const k = Object.keys(r).find(h => names.includes(h.trim().toLowerCase()));
        return k ? String(r[k]).trim() : "";
      };
      const find = (v) => scope.projects.find(p => [p.code, p.name].some(x => x && x.toLowerCase() === v.toLowerCase()));
      const skipped = [];
      const rows = [];
      raw.forEach((r, i) => {
        const name = pick(r, "vendor name", "vendor", "name");
        const where = pick(r, scope.kindLabel.toLowerCase(), "project / office", "project", "office");
        if (!name && !where) return; // empty line
        const place = where ? find(where) : scope.project;
        if (!place) { skipped.push({ row: i + 2, name, reason: where ? `${scope.kindLabel} "${where}" not found` : `${scope.kindLabel} is required` }); return; }
        rows.push({ row: i + 2, name, project_id: place.id });
      });
      if (!rows.length && !skipped.length) throw new Error("The file has no vendors");
      let added = 0;
      if (rows.length) {
        const { data } = await api.post("/api/petty-cash/vendor-directory/bulk", { company_id: scope.company.id, rows });
        added = data.added || 0;
        skipped.push(...(data.skipped || []));
      }
      skipped.sort((a, b) => a.row - b.row);
      setImportResult({ added, skipped });
      if (added) load();
    } catch (err) { showToast(apiError(err, "Upload failed"), "error"); }
    setImporting(false);
  };

  const removeVendor = async () => {
    const v = deleting;
    try {
      await api.post("/api/petty-cash/vendor-directory/delete", { company_id: scope.company.id, project_id: v.projectId, name: v.name });
      showToast(`${v.name} deleted`);
      setDeleting(null);
      load();
    } catch (err) { showToast(apiError(err, "Delete failed"), "error"); setDeleting(null); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 md:flex-1 md:min-h-0 md:flex md:flex-col md:space-y-0 md:gap-5">
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Vendors", val: filtered.length, icon: Store, accent: "#4f46e5", tint: "#eef2ff" },
          { label: "Total Spend", val: `₹ ${fmtAmount(totalSpend)}`, icon: IndianRupee, accent: "#e11d48", tint: "#fff1f2" },
          { label: "Expenses", val: filtered.reduce((n, v) => n + v.entries, 0), icon: Receipt, accent: "#0891b2", tint: "#ecfeff" },
          { label: "Not Used Yet", val: filtered.filter(v => !v.entries).length, icon: Clock3, accent: "#d97706", tint: "#fffbeb" },
        ].map(c => (
          <div key={c.label}
            className="relative overflow-hidden bg-white rounded-lg border border-slate-200/80 shadow-sm p-3 flex items-center gap-3 min-w-0">
            <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c.accent }} />
            <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: c.tint, color: c.accent }}>
              <c.icon size={16} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{c.label}</p>
              <p className="text-lg font-extrabold text-slate-800 leading-tight tracking-tight truncate tabular-nums">{loading ? "—" : c.val}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-20 shrink-0 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search vendor…"
            className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-slate-500" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(canExport || canBulk) && (
            <div className="relative">
              <button type="button" onClick={() => setImportOpen(o => !o)} disabled={importing}
                className="h-10 px-3.5 flex items-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {importing && <Loader2 size={15} className="animate-spin" />} More <ChevronDown size={14} className="text-slate-400" />
              </button>
              {importOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setImportOpen(false)} />
                  <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-1.5">
                    {canExport && (
                      <button type="button" onClick={() => { setImportOpen(false); exportExcel(); }} disabled={loading || !filtered.length}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        <FileSpreadsheet size={14} className="text-emerald-600" /> Export Excel
                      </button>
                    )}
                    {canBulk && (
                      <>
                        {canExport && <div className="my-1 border-t border-slate-100" />}
                        <button type="button" onClick={() => { setImportOpen(false); downloadTemplate(); }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                          <Download size={14} className="text-slate-400" /> Download Template
                        </button>
                        <button type="button" onClick={() => { setImportOpen(false); fileRef.current?.click(); }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                          <UploadCloud size={14} className="text-blue-600" /> Import Excel
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={uploadExcel} />
            </div>
          )}
          {canAdd && (
            <button type="button" onClick={() => setAdding(true)}
              className="h-10 px-4 flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
              <Plus size={16} /> Add
            </button>
          )}
        </div>
      </div>

      {error && <p className="shrink-0 text-sm text-red-600">{error}</p>}

      <div className="relative z-0 bg-white rounded-xl border border-slate-200 overflow-hidden md:flex-1 md:min-h-0 md:flex md:flex-col">
        <div className="overflow-auto md:flex-1 md:min-h-0 thin-scroll">
          <table className={GRID_TABLE}>
            <thead className="text-slate-600">
              <tr>
                {headers.map(h => (
                  <th key={h} className={`sticky top-0 z-20 bg-slate-50 px-4 py-2.5 font-semibold whitespace-nowrap ${["Entries", "Total Spend"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-slate-400"><BrandLoader /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-slate-400">
                  {search.trim() ? "No vendor matches your search" : "No vendors yet — add one, or they appear here once used on an expense"}
                </td></tr>
              ) : filtered.slice((page - 1) * perPage, page * perPage).map(v => (
                <tr key={`${v.projectId}|${keyOf(v.name)}`} className="border-t border-slate-200">
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => setViewing(v)} title="See entries"
                      className="flex items-center gap-2 font-medium text-slate-800 hover:text-blue-700 hover:underline text-left">
                      <Store size={14} className="text-slate-400 shrink-0" /> {v.name}
                    </button>
                  </td>
                  {showProject && <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{projectName(v.projectId)}</td>}
                  <td className="px-4 py-2.5 text-right tabular-nums">{v.entries}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-rose-700">{fmtAmount(v.total)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{v.lastUsed ? fmtDate(v.lastUsed) : "—"}</td>
                  {showActions && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {canEdit && (
                          <button type="button" onClick={() => setRenaming(v)} title="Rename / merge"
                            className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && v.entries === 0 && v.saved && (
                          <button type="button" onClick={() => setDeleting(v)} title="Delete (no expenses use it)"
                            className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
        )}
      </div>

      {renaming && (
        <RenameDialog vendor={renaming} scope={scope} others={vendors.filter(v => v.projectId === renaming.projectId && keyOf(v.name) !== keyOf(renaming.name))}
          projectName={projectName(renaming.projectId)}
          onClose={() => setRenaming(null)}
          onDone={(msg) => { setRenaming(null); showToast(msg); load(); }} />
      )}
      {viewing && <VendorEntries vendor={viewing} scope={scope} projectName={projectName(viewing.projectId)} onClose={() => setViewing(null)} />}
      {adding && (
        <AddDialog scope={scope} vendors={vendors} onClose={() => setAdding(false)}
          onDone={(msg) => { setAdding(false); showToast(msg); load(); }} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <h3 className="text-base font-bold text-slate-800">Delete vendor?</h3>
              <p className="text-sm text-slate-500 mt-1.5"><b>{deleting.name}</b> will be removed from {projectName(deleting.projectId)}. No expense uses it.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button type="button" onClick={() => setDeleting(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="button" onClick={removeVendor} className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && setImportResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between px-6 pt-5 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Upload done</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  <span className="font-semibold text-emerald-700">{importResult.added} added</span>
                  {importResult.skipped.length > 0 && <> · <span className="font-semibold text-amber-700">{importResult.skipped.length} skipped</span></>}
                </p>
              </div>
              <button type="button" onClick={() => setImportResult(null)} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {importResult.skipped.length > 0 && (
              <div className="overflow-auto thin-scroll border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead className="text-slate-600"><tr>{["Row", "Vendor", "Why skipped"].map(h => (
                    <th key={h} className="sticky top-0 bg-slate-50 px-4 py-2 font-semibold text-left">{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {importResult.skipped.map((s, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 tabular-nums text-slate-500">{s.row}</td>
                        <td className="px-4 py-2">{s.name || "—"}</td>
                        <td className="px-4 py-2 text-amber-800">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-semibold text-white ${toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>{toast.msg}</div>
      )}
    </div>
  );
}

// Add one vendor to a project / office (the one picked at the top, if any)
function AddDialog({ scope, vendors, onClose, onDone }) {
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(scope.project?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const clean = name.trim().replace(/\s+/g, " ");
  const exists = projectId && vendors.find(v => v.projectId === projectId && keyOf(v.name) === keyOf(clean));

  const save = async () => {
    if (!clean || !projectId || exists) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/api/petty-cash/vendor-directory", { company_id: scope.company.id, project_id: projectId, name: clean });
      onDone(`${clean} added`);
    } catch (err) { setError(apiError(err, "Could not add vendor")); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Add vendor</h3>
            <p className="text-xs text-slate-500 mt-0.5">{scope.company.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="px-6 pb-5 space-y-3">
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-slate-500 mb-1">{scope.kindLabel}</span>
            <div className="relative">
              <select value={projectId} onChange={e => setProjectId(e.target.value)}
                className={`w-full h-10 pl-3 pr-9 appearance-none border border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-slate-500 cursor-pointer ${projectId ? "text-slate-800" : "text-slate-400"}`}>
                <option value="">Select {scope.kindLabel.toLowerCase()}…</option>
                {scope.projects.map(p => <option key={p.id} value={p.id} className="text-slate-800">{p.name}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-semibold text-slate-500 mb-1">Vendor Name</span>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} placeholder="e.g. Sharma Hardware"
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm outline-none focus:border-slate-500" />
          </label>
          {exists && <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"><b>{exists.name}</b> is already in this {scope.kindLabel.toLowerCase()}.</p>}
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !clean || !projectId || !!exists}
            className="px-4 py-2 flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} Add
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameDialog({ vendor, scope, others, projectName, onClose, onDone }) {
  const [name, setName] = useState(vendor.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const clean = name.trim().replace(/\s+/g, " ");
  const mergeInto = others.find(v => keyOf(v.name) === keyOf(clean));
  const unchanged = clean === vendor.name;

  const save = async () => {
    if (!clean || unchanged) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/api/petty-cash/vendor-directory/rename", {
        company_id: scope.company.id, project_id: vendor.projectId, from: vendor.name, to: mergeInto ? mergeInto.name : clean,
      });
      onDone(mergeInto
        ? `Merged into ${mergeInto.name} (${data.updated} ${data.updated === 1 ? "entry" : "entries"})`
        : `Renamed on ${data.updated} ${data.updated === 1 ? "entry" : "entries"}`);
    } catch (err) { setError(apiError(err, "Rename failed")); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Rename vendor</h3>
            <p className="text-xs text-slate-500 mt-0.5">{projectName} · {vendor.entries} {vendor.entries === 1 ? "entry" : "entries"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="px-6 pb-5 space-y-3">
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()}
            className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm outline-none focus:border-slate-500" />
          {mergeInto ? (
            <p className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <GitMerge size={14} className="shrink-0 mt-0.5" />
              <span><b>{mergeInto.name}</b> already exists here ({mergeInto.entries} {mergeInto.entries === 1 ? "entry" : "entries"}). Saving merges the two into <b>{mergeInto.name}</b>.</span>
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">Changes the vendor name on all {vendor.entries} {vendor.entries === 1 ? "entry" : "entries"} of this {scope.kindLabel.toLowerCase()}. Other projects aren't touched.</p>
          )}
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !clean || unchanged}
            className="px-4 py-2 flex items-center gap-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} {mergeInto ? "Merge" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The vendor's expenses on its project / office
function VendorEntries({ vendor, scope, projectName, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/api/petty-cash/entries", { params: { company_id: scope.company.id, project_id: vendor.projectId } })
      .then(({ data }) => setRows((data.entries || [])
        .filter(e => e.entryType === "expense" && keyOf(e.vendorName) === keyOf(vendor.name))
        .sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)))))
      .catch(err => setError(apiError(err, "Failed to load entries")));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">{vendor.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{projectName} · {vendor.entries} {vendor.entries === 1 ? "entry" : "entries"} · ₹ {fmtAmount(vendor.total)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="overflow-auto thin-scroll">
          {error ? <p className="p-6 text-sm text-red-600">{error}</p>
            : !rows ? <div className="py-10"><BrandLoader /></div>
            : rows.length === 0 ? <p className="p-6 text-sm text-slate-400">You can't see any of this vendor's entries.</p>
            : (
              <table className={GRID_TABLE}>
                <thead className="text-slate-600">
                  <tr>{["Date", "Expense", "Paid By", "Amount"].map(h => (
                    <th key={h} className={`sticky top-0 bg-slate-50 px-4 py-2.5 font-semibold whitespace-nowrap ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.map(e => (
                    <tr key={e.id} className="border-t border-slate-200">
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                      <td className="px-4 py-2.5 max-w-[320px] truncate" title={e.particular}>{e.particular || "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{e.personName || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-rose-700">{fmtAmount(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
