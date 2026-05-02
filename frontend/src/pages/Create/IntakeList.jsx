import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, X, FileText, Upload, Save, Send,
  ChevronLeft, ChevronRight, Loader2, CheckCircle2,
  Clock, Eye, Hash, ChevronDown, ArrowLeft, PackagePlus,
  ThumbsUp, ThumbsDown, UserCheck, Play,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 15;

const inp = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 bg-white transition-all";
const lbl = "block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider";

const TABS = [
  { key: "all",       label: "All"       },
  { key: "draft",     label: "Drafts"    },
  { key: "submitted", label: "Submitted" },
  { key: "in_review", label: "In Review" },
  { key: "approved",  label: "Approved"  },
  { key: "working",   label: "Working"   },
  { key: "rejected",  label: "Rejected"  },
  { key: "closed",    label: "Closed"    },
];

const STATUS_BADGE = {
  draft:      { label: "Draft",       cls: "bg-yellow-50 text-yellow-600 border border-yellow-200"  },
  submitted:  { label: "Submitted",   cls: "bg-blue-50 text-blue-600 border border-blue-200"        },
  in_review:  { label: "In Review",   cls: "bg-purple-50 text-purple-600 border border-purple-200"  },
  approved:   { label: "Approved",    cls: "bg-green-50 text-green-600 border border-green-200"     },
  working:    { label: "Working",     cls: "bg-orange-50 text-orange-600 border border-orange-200"  },
  rejected:   { label: "Rejected",    cls: "bg-red-50 text-red-600 border border-red-200"           },
  closed:     { label: "Closed",      cls: "bg-slate-100 text-slate-500 border border-slate-200"    },
};

const PRIORITY_COLOR = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-50 text-blue-600",
  High:   "bg-orange-50 text-orange-600",
  Urgent: "bg-red-50 text-red-600",
};

const Toast = ({ msg, type }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg text-sm font-semibold
    ${type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
    {msg}
  </div>
);

const emptyItem = () => ({
  _id: Date.now() + Math.random(),
  product_name: "", make: "", unit: "",
  existing_qty: "", raised_qty: "", remarks: "", files: [],
});

/* ── Item row — defined outside to prevent re-mount ── */
const ItemRow = ({ item, idx, onChange, onRemove, canRemove }) => {
  const fileRef = useRef();
  const addFiles = (e) => {
    const picked = Array.from(e.target.files);
    e.target.value = "";
    onChange(idx, "files", [...item.files, ...picked].slice(0, 5));
  };
  return (
    <tr className="group hover:bg-slate-50/40 transition-colors">
      <td className="px-3 py-2.5 text-xs text-slate-400 font-medium w-10 text-center">{idx + 1}</td>
      <td className="px-2 py-2"><input className={inp} value={item.product_name} onChange={e => onChange(idx, "product_name", e.target.value)} placeholder="Product name" /></td>
      <td className="px-2 py-2"><input className={inp} value={item.make} onChange={e => onChange(idx, "make", e.target.value)} placeholder="Make / Brand" /></td>
      <td className="px-2 py-2 w-24"><input className={inp} value={item.unit} onChange={e => onChange(idx, "unit", e.target.value)} placeholder="Nos / Kg…" /></td>
      <td className="px-2 py-2 w-28"><input type="number" min="0" className={inp} value={item.existing_qty} onChange={e => onChange(idx, "existing_qty", e.target.value)} placeholder="0" /></td>
      <td className="px-2 py-2 w-28"><input type="number" min="0" className={inp} value={item.raised_qty} onChange={e => onChange(idx, "raised_qty", e.target.value)} placeholder="0" /></td>
      <td className="px-2 py-2"><input className={inp} value={item.remarks} onChange={e => onChange(idx, "remarks", e.target.value)} placeholder="Remarks…" /></td>
      <td className="px-2 py-2 w-44">
        <div className="space-y-1">
          {item.files.map((f, fi) => (
            <div key={fi} className="flex items-center gap-1.5 bg-indigo-50 rounded-lg px-2 py-1">
              <FileText size={11} className="text-indigo-500 shrink-0" />
              <span className="text-[10px] text-indigo-700 truncate flex-1 max-w-20">{f.name}</span>
              <button type="button" onClick={() => onChange(idx, "files", item.files.filter((_, i) => i !== fi))} className="text-slate-400 hover:text-red-400 shrink-0"><X size={10} /></button>
            </div>
          ))}
          {item.files.length < 5 && (
            <button type="button" onClick={() => fileRef.current.click()}
              className="flex items-center gap-1.5 text-[10px] text-indigo-500 font-semibold hover:text-indigo-700 px-2 py-1 rounded-lg border border-dashed border-indigo-200 w-full hover:bg-indigo-50 transition-all">
              <Upload size={10} /> Attach
            </button>
          )}
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" className="hidden" onChange={addFiles} />
        </div>
      </td>
      <td className="px-2 py-2 w-10 text-center">
        {canRemove && (
          <button type="button" onClick={() => onRemove(idx)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
};

export default function IntakeList({ project }) {
  const currentUser  = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isAdmin      = ["global_admin", "admin"].includes(currentUser.role);
  const isGlobal     = currentUser.role === "global_admin";

  /* ── view: "list" | "create" | "detail" ── */
  const [view,          setView]          = useState("list");
  const [activeTab,     setActiveTab]     = useState("all");
  const [intakes,       setIntakes]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [page,          setPage]          = useState(1);
  const [toast,         setToast]         = useState(null);
  const [detail,        setDetail]        = useState(null);
  const [submitting,    setSubmitting]    = useState(null);
  const [approvalFlow,  setApprovalFlow]  = useState(null); // intake approval config
  const [allUsers,      setAllUsers]      = useState([]);
  const [assignModal,   setAssignModal]   = useState(null); // intakeId being assigned
  const [assignTo,      setAssignTo]      = useState("");
  const [rejectModal,   setRejectModal]   = useState(null); // intakeId
  const [rejectReason,  setRejectReason]  = useState("");

  /* create form state */
  const [sites,    setSites]    = useState([]);
  const [saving,   setSaving]   = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [form,     setForm]     = useState({
    name: "", requisition_by: currentUser.name || "",
    priority: "Low", available_by: "", site_id: "", site_name: "",
  });
  const [items, setItems] = useState([emptyItem()]);

  useEffect(() => { fetchIntakes(); }, []);
  useEffect(() => {
    fetch(`${API}/api/procurement/sites`).then(r => r.json())
      .then(d => setSites(d.sites || [])).catch(() => {});
  }, []);
  useEffect(() => {
    // Load approval flow config for intake module
    fetch(`${API}/api/intakes/approval-flows`).then(r => r.json())
      .then(d => { const f = (d.flows||[]).find(x => x.module === "intake"); setApprovalFlow(f || null); })
      .catch(() => {});
    // Load users for assign dropdown (admin+)
    if (isAdmin) {
      const token = localStorage.getItem("bms_token") || "";
      fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setAllUsers(d.users || [])).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!form.site_id) { setPreview(null); return; }
    fetch(`${API}/api/intakes/serialization/next/intake/${form.site_id}`)
      .then(r => r.json()).then(d => setPreview(d.preview || null)).catch(() => setPreview(null));
  }, [form.site_id]);

  const fetchIntakes = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/intakes`);
      const data = await res.json();
      setIntakes(data.intakes || []);
    } catch { setIntakes([]); }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── List helpers ── */
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const normProject = String(project || "").trim().toLowerCase();
  const isAllProject = !normProject || normProject === "all project";
  const projectMatches = (...values) => (
    isAllProject || values.some(v => String(v || "").trim().toLowerCase() === normProject)
  );
  const availableSites = isAllProject
    ? sites
    : sites.filter(s => projectMatches(s.siteCode, s.site_code, s.siteName, s.site_name));

  const filtered = intakes.filter(i => {
    const matchProject = projectMatches(i.site_code, i.siteCode, i.site_name, i.siteName);
    return matchProject && (activeTab === "all" || i.status === activeTab);
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSubmitDraft = async (id) => {
    if (!confirm("Submit this draft to procurement?")) return;
    setSubmitting(id);
    try {
      const res  = await fetch(`${API}/api/intakes/${id}/submit`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Submitted — ${data.intake_number || "No serial (configure Serialization in Profile)"}`);
      fetchIntakes();
      if (detail?.id === id) setDetail(prev => ({ ...prev, status: "submitted", intake_number: data.intake_number }));
    } catch (err) { showToast(err.message, "error"); }
    setSubmitting(null);
  };

  const canApprove = (intake) => {
    if (!isAdmin) return false;
    if (intake.status !== "submitted") return false;
    if (isGlobal) return true;
    return approvalFlow?.approver_user_id === currentUser.id;
  };

  const handleApprove = async (id) => {
    setSubmitting(id + "_approve");
    try {
      const res = await fetch(`${API}/api/intakes/${id}/approve`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: currentUser.name }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Intake approved"); fetchIntakes();
      if (detail?.id === id) setDetail(p => ({ ...p, status: "approved", approved_by: currentUser.name }));
    } catch { showToast("Failed to approve", "error"); }
    setSubmitting(null);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setSubmitting(rejectModal + "_reject");
    try {
      const res = await fetch(`${API}/api/intakes/${rejectModal}/reject`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reject_reason: rejectReason, rejected_by: currentUser.name }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Intake rejected"); setRejectModal(null); setRejectReason(""); fetchIntakes();
    } catch { showToast("Failed to reject", "error"); }
    setSubmitting(null);
  };

  const handleAssign = async () => {
    if (!assignModal || !assignTo) return showToast("Select a person to assign", "error");
    const user = allUsers.find(u => u.id === assignTo);
    setSubmitting(assignModal + "_assign");
    try {
      const res = await fetch(`${API}/api/intakes/${assignModal}/assign`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to_id: assignTo, assigned_to_name: user?.name || "", assigned_by_name: currentUser.name }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`Assigned to ${user?.name}`); setAssignModal(null); setAssignTo(""); fetchIntakes();
    } catch { showToast("Failed to assign", "error"); }
    setSubmitting(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this intake?")) return;
    try {
      await fetch(`${API}/api/intakes/${id}`, { method: "DELETE" });
      showToast("Deleted"); fetchIntakes();
      if (detail?.id === id) { setDetail(null); setView("list"); }
    } catch { showToast("Delete failed", "error"); }
  };

  /* ── Create form helpers ── */
  const resetForm = () => {
    setForm({ name: "", requisition_by: currentUser.name || "", priority: "Low", available_by: "", site_id: "", site_name: "" });
    setItems([emptyItem()]);
    setPreview(null);
  };

  const updateItem = (idx, field, value) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const handleSave = async (status) => {
    if (!form.name.trim())  return showToast("Intake name required", "error");
    if (!form.site_id)      return showToast("Please select a site", "error");
    const validItems = items.filter(it => it.product_name.trim());
    if (!validItems.length) return showToast("Add at least one item", "error");

    setSaving(status);
    try {
      const fd = new FormData();
      fd.append("intakeData", JSON.stringify({
        ...form, status, created_by: currentUser.name || "",
        items: validItems.map(it => ({
          product_name: it.product_name, make: it.make, unit: it.unit,
          existing_qty: it.existing_qty, raised_qty: it.raised_qty, remarks: it.remarks,
        })),
      }));
      validItems.forEach((it, idx) =>
        it.files.forEach((file, fi) => fd.append(`item_${idx}_file_${fi}`, file))
      );
      const res  = await fetch(`${API}/api/intakes`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      showToast(status === "draft" ? "Saved as draft" : `Submitted — ${data.intake_number || "No serial configured"}`);
      resetForm();
      setView("list");
      // switch to correct tab
      setActiveTab(status === "draft" ? "draft" : "submitted");
      setPage(1);
      fetchIntakes();
    } catch (err) { showToast(err.message, "error"); }
    setSaving(null);
  };

  /* ══════════ RENDER ══════════ */

  /* ── CREATE VIEW ── */
  if (view === "create") {
    return (
      <div className="p-4 md:p-6 w-full">
        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {/* Back + header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { resetForm(); setView("list"); }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all">
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <PackagePlus size={16} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">Create Intake</h1>
              <p className="text-xs text-slate-400">Raise a material purchase requisition</p>
            </div>
          </div>
        </div>

        {/* Header form */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className={lbl}>Intake Name <span className="text-red-400 normal-case font-normal">*</span></label>
              <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter intake name / description" />
            </div>
            <div>
              <label className={lbl}>Intake Number</label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
                <Hash size={13} className="text-slate-400 shrink-0" />
                <span className={`text-sm font-mono font-bold ${preview ? "text-indigo-600" : "text-slate-300"}`}>
                  {preview || "Select site to preview"}
                </span>
              </div>
            </div>
            <div>
              <label className={lbl}>Requisition By <span className="text-red-400 normal-case font-normal">*</span></label>
              <input className={inp} value={form.requisition_by} onChange={e => setForm(f => ({ ...f, requisition_by: e.target.value }))} placeholder="Name" />
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <div className="relative">
                <select className={`${inp} appearance-none pr-8`} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {["Low","Medium","High","Urgent"].map(p => <option key={p}>{p}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className={lbl}>Required By Date</label>
              <input type="date" className={inp} value={form.available_by} onChange={e => setForm(f => ({ ...f, available_by: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Site <span className="text-red-400 normal-case font-normal">*</span></label>
              <div className="relative">
                <select className={`${inp} appearance-none pr-8`} value={form.site_id}
                  onChange={e => { const s = sites.find(x => x.id === e.target.value); setForm(f => ({ ...f, site_id: e.target.value, site_name: s?.siteName || "" })); }}>
                  <option value="">Select site…</option>
                  {availableSites.map(s => <option key={s.id} value={s.id}>{s.siteName}{s.siteCode ? ` (${s.siteCode})` : ""}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <h3 className="text-sm font-bold text-slate-700">Item Details</h3>
            <button onClick={() => setItems(p => [...p, emptyItem()])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 transition-all">
              <Plus size={13} /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["#","Product Name","Make","Unit","Existing Qty","Raised Qty","Remarks","Attachments (max 5)",""].map((h, i) => (
                    <th key={i} className="px-2 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => (
                  <ItemRow key={item._id} item={item} idx={idx}
                    onChange={updateItem}
                    onRemove={(i) => setItems(p => p.filter((_, x) => x !== i))}
                    canRemove={items.length > 1} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/50">
            <button onClick={() => setItems(p => [...p, emptyItem()])}
              className="flex items-center gap-1.5 text-xs text-indigo-500 font-semibold hover:text-indigo-700 transition-colors">
              <Plus size={13} /> Add another row
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => handleSave("draft")} disabled={!!saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all">
            {saving === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save as Draft
          </button>
          <button onClick={() => handleSave("submitted")} disabled={!!saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm">
            {saving === "submitted" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Submit to Procurement
          </button>
        </div>
      </div>
    );
  }

  /* ── LIST VIEW ── */
  return (
    <div className="p-4 md:p-6 w-full">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Intakes</h1>
            <p className="text-xs text-slate-400">{intakes.length} total · {intakes.filter(i => i.status === "draft").length} drafts</p>
          </div>
        </div>
        {activeTab === "all" && (
          <button onClick={() => { resetForm(); setView("create"); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm">
            <Plus size={15} /> Create Intake
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-1.5 flex gap-1 overflow-x-auto mb-4">
        {TABS.map(t => {
          const count = t.key === "all" ? intakes.length : intakes.filter(i => i.status === t.key).length;
          return (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all
                ${activeTab === t.key ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>
              {t.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === t.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-indigo-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No intakes here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["S.No","Intake No.","Name","Site","Requested By","Priority","Required By","Items","Status","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.map((intake, idx) => {
                  const badge = STATUS_BADGE[intake.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={intake.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400">{(page-1)*PER_PAGE+idx+1}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-xs font-bold ${intake.intake_number ? "text-indigo-600" : "text-slate-300"}`}>
                          {intake.intake_number || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 max-w-44 truncate">{intake.name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{intake.site_name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{intake.requisition_by || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[intake.priority] || PRIORITY_COLOR.Low}`}>
                          {intake.priority || "Low"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(intake.available_by)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{intake.intake_items?.length || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button onClick={() => { setDetail(intake); setView("detail"); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="View">
                            <Eye size={13} />
                          </button>
                          {/* Submit draft */}
                          {intake.status === "draft" && (
                            <button onClick={() => handleSubmitDraft(intake.id)} disabled={!!submitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Submit to procurement">
                              {submitting === intake.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            </button>
                          )}
                          {/* Approve */}
                          {canApprove(intake) && (
                            <button onClick={() => handleApprove(intake.id)} disabled={!!submitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all" title="Approve">
                              <ThumbsUp size={13} />
                            </button>
                          )}
                          {/* Reject */}
                          {canApprove(intake) && (
                            <button onClick={() => { setRejectModal(intake.id); setRejectReason(""); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Reject">
                              <ThumbsDown size={13} />
                            </button>
                          )}
                          {/* Assign (after approved) */}
                          {isAdmin && intake.status === "approved" && (
                            <button onClick={() => { setAssignModal(intake.id); setAssignTo(""); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all" title="Assign to team">
                              <UserCheck size={13} />
                            </button>
                          )}
                          {/* Start working (assigned person) */}
                          {intake.status === "in_review" && (intake.assigned_to_id === currentUser.id || isAdmin) && (
                            <button onClick={async () => {
                              await fetch(`${API}/api/intakes/${intake.id}/start-working`, { method: "PATCH" });
                              showToast("Status updated to Working"); fetchIntakes();
                            }} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-all" title="Start Working">
                              <Play size={13} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(intake.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">{filtered.length} intakes · Page {page} of {totalPages}</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const n = totalPages <= 5 ? i+1 : page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i;
                  return (
                    <button key={n} onClick={() => setPage(n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${page===n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-white"}`}>
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-black text-slate-800 mb-4">Reject Intake</h3>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Reason for rejection</label>
            <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-400 text-slate-700 resize-none" rows={3}
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason…" />
            <div className="flex gap-2 mt-4">
              <button onClick={handleReject} disabled={!!submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-all">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />} Reject
              </button>
              <button onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-black text-slate-800 mb-4">Assign to Team Member</h3>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Select person</label>
            <div className="relative">
              <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 text-slate-700 appearance-none pr-8"
                value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                <option value="">Select team member…</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.designation || u.role}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAssign} disabled={!!submitting || !assignTo}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Assign
              </button>
              <button onClick={() => { setAssignModal(null); setAssignTo(""); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail side drawer */}
      {view === "detail" && detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setView("list")}>
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Intake Detail</p>
                <h2 className="text-base font-black text-slate-800">{detail.name}</h2>
                {detail.intake_number && <p className="text-sm font-mono font-bold text-indigo-600 mt-0.5">{detail.intake_number}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {detail.status === "draft" && (
                  <button onClick={() => handleSubmitDraft(detail.id)} disabled={submitting === detail.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-all">
                    {submitting === detail.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Submit
                  </button>
                )}
                <button onClick={() => setView("list")} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-b border-slate-50 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Status",      value: STATUS_BADGE[detail.status]?.label || detail.status },
                  { label: "Site",        value: detail.site_name },
                  { label: "Requested By",value: detail.requisition_by },
                  { label: "Priority",    value: detail.priority },
                  { label: "Required By", value: fmt(detail.available_by) },
                  { label: "Created",     value: fmt(detail.created_at) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-slate-700">{value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 px-6 py-4 overflow-y-auto">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Items ({detail.intake_items?.length || 0})</p>
              {(!detail.intake_items?.length) ? (
                <p className="text-sm text-slate-400 text-center py-8">No items</p>
              ) : (
                <div className="space-y-3">
                  {detail.intake_items.map((item, i) => (
                    <div key={item.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm">{i+1}. {item.product_name || "—"}</p>
                          {item.make && <p className="text-xs text-slate-500 mt-0.5">Make: {item.make}</p>}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Existing</p>
                            <p className="text-sm font-semibold text-slate-700">{item.existing_qty ?? "—"} {item.unit}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Raised</p>
                            <p className="text-sm font-bold text-indigo-600">{item.raised_qty ?? "—"} {item.unit}</p>
                          </div>
                        </div>
                      </div>
                      {item.remarks && <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">{item.remarks}</p>}
                      {item.attachments?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100">
                          {item.attachments.map((att, ai) => (
                            <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-all">
                              <FileText size={11} /> {att.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
