import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, Search, FileText, Download, Pencil, Trash2, X, Loader2,
  ChevronDown, FolderOpen, Folder, Eye, Calendar, Tag, User, Building2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const STATUS_CFG = {
  draft:    { label: "Draft",    cls: "bg-slate-100 text-slate-600 border border-slate-200"    },
  active:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  archived: { label: "Archived", cls: "bg-red-50 text-red-500 border border-red-200"            },
};

const EMPTY_FORM = {
  title: "", category: "General", version: "v1.0", status: "draft",
  effectiveDate: "", reviewDate: "", department: "", approvedBy: "", content: "",
};

const fmt = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
};

/* ── Delete confirm modal ── */
function DeleteModal({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Trash2 size={16} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Delete Policy</p>
            <p className="text-xs text-slate-500 mt-0.5">"{name}" permanently delete ho jaayegi.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ── Create / Edit modal ── */
function PolicyModal({ form, setForm, editId, saving, onClose, onSave, allCategories }) {
  const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";
  const lbl = "block text-xs font-semibold text-slate-600 mb-1";

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-bold text-slate-800">{editId ? "Edit Policy" : "New Policy"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">
          {/* Row 1: Title */}
          <div>
            <label className={lbl}>Policy Title <span className="text-red-500">*</span></label>
            <input className={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Leave Policy 2025" />
          </div>

          {/* Row 2: Category + Version + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Category</label>
              <input className={inp} list="cat-list" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="HR Policy" />
              <datalist id="cat-list">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className={lbl}>Version</label>
              <input className={inp} value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="v1.0" />
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select className={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Row 3: Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Effective Date</label>
              <input type="date" className={inp} value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Review Date</label>
              <input type="date" className={inp} value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))} />
            </div>
          </div>

          {/* Row 4: Department + Approved By */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Department</label>
              <input className={inp} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. HR, Finance" />
            </div>
            <div>
              <label className={lbl}>Approved By</label>
              <input className={inp} value={form.approvedBy} onChange={e => setForm(f => ({ ...f, approvedBy: e.target.value }))} placeholder="e.g. CEO" />
            </div>
          </div>

          {/* Row 5: Content */}
          <div className="flex-1">
            <label className={lbl}>Policy Content <span className="text-slate-400 font-normal">(HTML supported)</span></label>
            <textarea
              className={`${inp} min-h-[200px] resize-y font-mono text-xs leading-relaxed`}
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={"<h2>1. Purpose</h2>\n<p>This policy establishes...</p>\n\n<h2>2. Scope</h2>\n<p>This policy applies to all employees...</p>"}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Tags: &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;&lt;li&gt;, &lt;ol&gt;&lt;li&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;table&gt;
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {editId ? "Update Policy" : "Create Policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Policy component ── */
export default function Policy({ actionsRef, companyId, orgName }) {
  const [policies,    setPolicies]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [modal,       setModal]       = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [editId,      setEditId]      = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast,       setToast]       = useState(null);
  const [pdfLoading,  setPdfLoading]  = useState(null);
  const [pdfViewer,   setPdfViewer]   = useState(null);   // { policy, blobUrl, loading }
  const pdfBlobRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const url = companyId
        ? `${API}/api/organisation/policies?company_id=${companyId}`
        : `${API}/api/organisation/policies`;
      const res  = await fetch(url);
      const data = await res.json();
      setPolicies(data.policies || []);
    } catch { showToast("Failed to load policies", "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPolicies(); }, [companyId]);

  /* wire actionsRef */
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = { openAdd: () => { setForm(EMPTY_FORM); setEditId(null); setModal(true); } };
    return () => { actionsRef.current = {}; };
  });

  const allCategories = useMemo(() =>
    ["General", ...new Set(policies.map(p => p.category).filter(c => c && c !== "General"))].sort()
  , [policies]);

  const categoryCounts = useMemo(() => {
    const m = { all: policies.length };
    policies.forEach(p => { m[p.category] = (m[p.category] || 0) + 1; });
    return m;
  }, [policies]);

  const filtered = useMemo(() => {
    let list = activeCategory === "all" ? policies : policies.filter(p => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.policy_code || "").toLowerCase().includes(q) ||
        (p.department || "").toLowerCase().includes(q) ||
        (p.approved_by || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [policies, activeCategory, search]);

  const openEdit = (p) => {
    setForm({
      title:         p.title         || "",
      category:      p.category      || "General",
      version:       p.version       || "v1.0",
      status:        p.status        || "draft",
      effectiveDate: p.effective_date ? String(p.effective_date).slice(0, 10) : "",
      reviewDate:    p.review_date    ? String(p.review_date).slice(0, 10) : "",
      department:    p.department    || "",
      approvedBy:    p.approved_by   || "",
      content:       p.content       || "",
    });
    setEditId(p.id);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast("Title is required", "error"); return; }
    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, companyId: companyId || null, createdById: u.id || "", createdByName: u.name || "" };
      const url    = editId ? `${API}/api/organisation/policies/${editId}` : `${API}/api/organisation/policies`;
      const method = editId ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      await fetchPolicies();
      showToast(editId ? "Policy updated" : "Policy created");
      setModal(false);
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = (p) => setDeleteConfirm({ id: p.id, name: p.title });

  const confirmDelete = async () => {
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await fetch(`${API}/api/organisation/policies/${id}`, { method: "DELETE" });
      setPolicies(prev => prev.filter(p => p.id !== id));
      showToast("Policy deleted");
    } catch { showToast("Failed to delete", "error"); }
  };

  const viewPdf = async (p) => {
    setPdfViewer({ policy: p, blobUrl: null, loading: true });
    try {
      const res = await fetch(`${API}/api/organisation/policies/${p.id}/pdf`);
      if (!res.ok) throw new Error("Failed to load PDF");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      if (pdfBlobRef.current) URL.revokeObjectURL(pdfBlobRef.current);
      pdfBlobRef.current = url;
      setPdfViewer({ policy: p, blobUrl: url, loading: false });
    } catch (err) {
      showToast(err.message || "Failed to load PDF", "error");
      setPdfViewer(null);
    }
  };

  const closePdfViewer = () => {
    if (pdfBlobRef.current) { URL.revokeObjectURL(pdfBlobRef.current); pdfBlobRef.current = null; }
    setPdfViewer(null);
  };

  const downloadPdf = async (p) => {
    setPdfLoading(p.id);
    try {
      const res = await fetch(`${API}/api/organisation/policies/${p.id}/pdf?download=1`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "PDF generation failed");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const safe = p.title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "-");
      a.href     = href;
      a.download = `${p.policy_code}-${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch (err) { showToast(err.message || "PDF generation failed", "error"); }
    finally { setPdfLoading(null); }
  };

  return (
    <div className="flex gap-0 -mx-6 -mt-5 -mb-4" style={{ height: "calc(100vh - 56px)" }}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[400] px-4 py-3 rounded-lg text-sm font-medium shadow-lg border
          ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <PolicyModal form={form} setForm={setForm} editId={editId} saving={saving}
          onClose={() => setModal(false)} onSave={handleSave} allCategories={allCategories} />
      )}
      {deleteConfirm && (
        <DeleteModal name={deleteConfirm.name} onConfirm={confirmDelete} onCancel={() => setDeleteConfirm(null)} />
      )}

      {pdfViewer && (
        <div className="fixed inset-0 z-[250] bg-black/60 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-900 text-white shrink-0">
            <div>
              <p className="text-sm font-semibold">{pdfViewer.policy.title}</p>
              <p className="text-xs text-slate-400">{pdfViewer.policy.policy_code}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => downloadPdf(pdfViewer.policy)}
                disabled={pdfLoading === pdfViewer.policy.id}
                className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded transition-colors disabled:opacity-60">
                {pdfLoading === pdfViewer.policy.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
              </button>
              <button onClick={closePdfViewer} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>
          {pdfViewer.loading ? (
            <div className="flex-1 flex items-center justify-center bg-slate-800">
              <div className="flex items-center gap-3 text-white">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Generating PDF…</span>
              </div>
            </div>
          ) : (
            <iframe
              src={pdfViewer.blobUrl}
              className="flex-1 w-full border-0 bg-white"
              title={pdfViewer.policy.title}
            />
          )}
        </div>
      )}

      {/* Left sidebar — categories */}
      <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Categories</p>
        </div>
        <nav className="flex flex-col p-2 gap-0.5">
          <button
            onClick={() => setActiveCategory("all")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors text-left
              ${activeCategory === "all" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200/60"}`}>
            <span className="flex items-center gap-2">
              <FolderOpen size={14} className={activeCategory === "all" ? "text-white" : "text-slate-400"} />
              All Policies
            </span>
            <span className={`text-[11px] font-medium px-1.5 rounded ${activeCategory === "all" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"}`}>
              {categoryCounts.all || 0}
            </span>
          </button>

          <div className="my-1 border-t border-slate-200" />

          {allCategories.map(cat => (
            <button key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors text-left
                ${activeCategory === cat ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200/60"}`}>
              <span className="flex items-center gap-2">
                <Folder size={13} className={activeCategory === cat ? "text-white" : "text-slate-400"} />
                <span className="truncate">{cat}</span>
              </span>
              <span className={`text-[11px] font-medium px-1.5 rounded shrink-0 ${activeCategory === cat ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"}`}>
                {categoryCounts[cat] || 0}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search policies…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">{filtered.length} {filtered.length === 1 ? "policy" : "policies"}</span>
            <button onClick={() => { setForm(EMPTY_FORM); setEditId(null); setModal(true); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={14} /> Add Policy
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
              <Loader2 size={18} className="animate-spin" /> Loading policies…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
              <FileText size={32} className="opacity-30" />
              <p className="text-sm">{search ? "No policies match your search" : "No policies yet — click \"Add Policy\" to create one"}</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">Policy No.</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Title</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">Category</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">Version</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">Effective Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">Approved By</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const s = STATUS_CFG[p.status] || STATUS_CFG.draft;
                  return (
                    <tr key={p.id} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                      <td className="px-4 py-3 font-mono text-[12px] text-slate-500 whitespace-nowrap">{p.policy_code}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-[13px] leading-snug">{p.title}</p>
                        {p.department && <p className="text-[11px] text-slate-400 mt-0.5">{p.department}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[12px] text-slate-600">
                          <Tag size={11} className="text-slate-400" />{p.category || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-600 whitespace-nowrap">{p.version || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} className="text-slate-400" />{fmt(p.effective_date)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">
                        {p.approved_by
                          ? <span className="flex items-center gap-1"><User size={11} className="text-slate-400" />{p.approved_by}</span>
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => viewPdf(p)} title="View PDF"
                            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Eye size={13} />
                          </button>
                          <button onClick={() => downloadPdf(p)} title="Download PDF"
                            disabled={pdfLoading === p.id}
                            className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                            {pdfLoading === p.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                          </button>
                          <button onClick={() => openEdit(p)} title="Edit"
                            className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(p)} title="Delete"
                            className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
