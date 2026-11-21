import { useEffect, useMemo, useState } from "react";
import { Search, Pencil, X, Loader2, Store, GitMerge } from "lucide-react";
import api from "../../utils/api";
import Pagination from "./Pagination";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { GRID_TABLE, fmtAmount, fmtDate, apiError } from "./pettyCashConstants";
import BrandLoader from "../../components/BrandLoader";

// Vendor names are typed on expense entries — this tab lists them per
// project / office (same name in any case / spacing = one vendor), with what
// was spent. Rename fixes a name on all that project's entries; renaming to
// a name the project already has merges the two.
const keyOf = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

// scope = { company, project (null = all), projects, kind, kindLabel } from the Petty Cash header
export default function PettyCashVendors({ scope }) {
  const { canEdit } = useModulePermissions("petty_cash_staff");
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
  const headers = ["Vendor", ...(showProject ? [scope.kindLabel] : []), "Entries", "Total Spend", "Last Used", ...(canEdit ? ["Action"] : [])];

  return (
    <div className="p-4 sm:p-6 space-y-5 md:flex-1 md:min-h-0 md:flex md:flex-col md:space-y-0 md:gap-5">
      <div className="shrink-0 grid grid-cols-2 gap-3">
        {[
          { label: "Vendors", value: loading ? "—" : filtered.length },
          { label: "Total Spend", value: loading ? "—" : `₹ ${fmtAmount(totalSpend)}`, color: "text-rose-700" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-xl sm:text-2xl font-extrabold mt-1 tabular-nums ${c.color || "text-slate-900"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="shrink-0 relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search vendor…"
          className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-slate-500" />
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
                  {search.trim() ? "No vendor matches your search" : "No vendors yet — they appear here once used on an expense"}
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
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setRenaming(v)} title="Rename / merge"
                        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50">
                        <Pencil size={14} />
                      </button>
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

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-semibold text-white ${toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>{toast.msg}</div>
      )}
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
