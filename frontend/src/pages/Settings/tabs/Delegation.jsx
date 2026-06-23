import { useState, useEffect, useRef } from "react";
import { UserCheck, Plus, Trash2, Loader2, CalendarRange, ChevronDown, ToggleLeft, ToggleRight, X } from "lucide-react";
import api from "../../../utils/api";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const ACTION_ORDER = ["issue", "recall", "cancel", "amend", "approval"];

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isCurrentlyActive(delegation) {
  if (!delegation.is_active) return false;
  const today = new Date().toISOString().slice(0, 10);
  return delegation.start_date <= today && delegation.end_date >= today;
}

function StatusBadge({ delegation }) {
  const active = isCurrentlyActive(delegation);
  if (!delegation.is_active)
    return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-400">Disabled</span>;
  if (active)
    return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-600">Active Now</span>;
  const today = new Date().toISOString().slice(0, 10);
  if (delegation.start_date > today)
    return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-500">Upcoming</span>;
  return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-400">Expired</span>;
}

const EMPTY_FORM = { delegate_id: "", actions: [], start_date: "", end_date: "", reason: "" };

export default function Delegation({ showToast }) {
  const token       = localStorage.getItem("bms_token");
  const headers     = { Authorization: `Bearer ${token}` };
  const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");

  const [powers,      setPowers]      = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [allUsers,    setAllUsers]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [editId,      setEditId]      = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [toggling,    setToggling]    = useState({});
  const [deleting,    setDeleting]    = useState({});
  const [userSearch,  setUserSearch]  = useState("");
  const [userOpen,    setUserOpen]    = useState(false);
  const userDropdownRef               = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (!userOpen) return;
    const handler = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setUserOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userOpen]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [powersRes, delegRes, usersRes] = await Promise.all([
        fetch(`${API}/api/delegations/my-powers`, { headers }),
        fetch(`${API}/api/delegations/my`,         { headers }),
        api.get("/api/users"),
      ]);
      const pd = await powersRes.json();
      const dd = await delegRes.json();
      setPowers(pd.powers || []);
      setDelegations(dd.delegations || []);
      setAllUsers((usersRes.data.users || []).filter(u => u.is_active !== false && String(u.id) !== String(currentUser.id)));
    } catch {
      showToast?.("Failed to load delegation data", "error");
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setUserSearch("");
    setShowForm(true);
  };

  const openEdit = (d) => {
    const delegateUser = allUsers.find(u => String(u.id) === String(d.delegate_id));
    setForm({
      delegate_id: d.delegate_id,
      actions:     d.actions || [],
      start_date:  d.start_date,
      end_date:    d.end_date,
      reason:      d.reason || "",
    });
    setUserSearch(delegateUser?.name || "");
    setEditId(d.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); setUserSearch(""); };

  const toggleAction = (key) => {
    setForm(f => ({
      ...f,
      actions: f.actions.includes(key) ? f.actions.filter(a => a !== key) : [...f.actions, key],
    }));
  };

  const handleSave = async () => {
    if (!form.delegate_id) return showToast?.("Please select a person to delegate to", "error");
    if (!form.actions.length) return showToast?.("Select at least one power to delegate", "error");
    if (!form.start_date || !form.end_date) return showToast?.("Please set the date range", "error");
    if (form.end_date < form.start_date) return showToast?.("End date must be on or after start date", "error");

    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url    = editId ? `${API}/api/delegations/${editId}` : `${API}/api/delegations`;
      const res    = await fetch(url, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return showToast?.(data.error || "Save failed", "error");

      showToast?.(editId ? "Delegation updated" : "Delegation created", "success");
      closeForm();
      fetchAll();
    } catch {
      showToast?.("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d) => {
    setToggling(t => ({ ...t, [d.id]: true }));
    try {
      const res = await fetch(`${API}/api/delegations/${d.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, is_active: !d.is_active }),
      });
      if (!res.ok) { const e = await res.json(); return showToast?.(e.error || "Failed", "error"); }
      setDelegations(prev => prev.map(x => x.id === d.id ? { ...x, is_active: !d.is_active } : x));
    } catch {
      showToast?.("Failed to update", "error");
    } finally {
      setToggling(t => ({ ...t, [d.id]: false }));
    }
  };

  const handleDelete = async (id) => {
    setDeleting(t => ({ ...t, [id]: true }));
    try {
      const res = await fetch(`${API}/api/delegations/${id}`, { method: "DELETE", headers });
      if (!res.ok) { const e = await res.json(); return showToast?.(e.error || "Failed", "error"); }
      setDelegations(prev => prev.filter(x => x.id !== id));
      showToast?.("Delegation removed", "success");
    } catch {
      showToast?.("Delete failed", "error");
    } finally {
      setDeleting(t => ({ ...t, [id]: false }));
    }
  };

  const filteredUsers = allUsers.filter(u =>
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedUser = allUsers.find(u => String(u.id) === String(form.delegate_id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="bg-white rounded-none shadow-sm border border-slate-100 p-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg shrink-0">
            <UserCheck size={18} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Delegation</h2>
            <p className="text-[12px] text-slate-500 mt-0.5 max-w-lg">
              Delegate your approval or action powers to another person for a specific date range — useful when you're on leave.
            </p>
          </div>
        </div>
        {powers.length > 0 && !showForm && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-[13px] font-semibold rounded hover:bg-indigo-700 transition-colors shrink-0"
          >
            <Plus size={14} /> Add Delegation
          </button>
        )}
      </div>

      {/* No powers */}
      {powers.length === 0 && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100 p-10 flex flex-col items-center gap-2 text-center">
          <CalendarRange size={28} className="text-slate-300" />
          <p className="text-[13px] font-semibold text-slate-400">No delegable powers</p>
          <p className="text-[12px] text-slate-400">You don't have any approval or action powers assigned to you yet.</p>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-slate-700">{editId ? "Edit Delegation" : "New Delegation"}</p>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>

          {/* Delegate To */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-slate-600">Delegate To <span className="text-red-500">*</span></label>
            <div className="relative" ref={userDropdownRef}>
              <button
                type="button"
                onClick={() => setUserOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded px-3 py-2 text-[13px] bg-white hover:border-indigo-400 transition-colors"
              >
                <span className={selectedUser ? "text-slate-800" : "text-slate-400"}>
                  {selectedUser ? `${selectedUser.name} — ${selectedUser.email || ""}` : "Select person..."}
                </span>
                <ChevronDown size={14} className="text-slate-400 shrink-0" />
              </button>
              {userOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded shadow-lg max-h-52 overflow-y-auto">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      autoFocus
                      type="text"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search name or email..."
                      className="w-full text-[12px] px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-indigo-400"
                    />
                  </div>
                  {filteredUsers.length === 0 ? (
                    <p className="text-[12px] text-slate-400 text-center py-3">No users found</p>
                  ) : (
                    filteredUsers.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, delegate_id: u.id })); setUserSearch(u.name); setUserOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-[12px] hover:bg-indigo-50 transition-colors flex flex-col gap-0.5
                          ${String(u.id) === String(form.delegate_id) ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700"}`}
                      >
                        <span className="font-medium">{u.name}</span>
                        {u.email && <span className="text-slate-400 text-[11px]">{u.email}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Powers */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-slate-600">Powers to Delegate <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {powers
                .sort((a, b) => ACTION_ORDER.indexOf(a.key) - ACTION_ORDER.indexOf(b.key))
                .map(p => {
                  const checked = form.actions.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => toggleAction(p.key)}
                      className={`px-3 py-1.5 rounded border text-[12px] font-medium transition-colors
                        ${checked
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-semibold text-slate-600">From <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="border border-slate-200 rounded px-3 py-2 text-[13px] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-semibold text-slate-600">To <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="border border-slate-200 rounded px-3 py-2 text-[13px] outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-slate-600">Reason <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Annual leave, Conference..."
              className="border border-slate-200 rounded px-3 py-2 text-[13px] outline-none focus:border-indigo-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end pt-1">
            <button onClick={closeForm} className="px-4 py-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-[13px] font-semibold rounded hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {editId ? "Update Delegation" : "Save Delegation"}
            </button>
          </div>
        </div>
      )}

      {/* Delegations List */}
      {delegations.length > 0 && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wide">Your Delegations</p>
          </div>
          <div className="divide-y divide-slate-100">
            {delegations.map(d => (
              <div key={d.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-slate-800">{d.delegate?.name || "Unknown"}</span>
                    <StatusBadge delegation={d} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(d.actions || [])
                      .sort((a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b))
                      .map(a => (
                        <span key={a} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-medium capitalize">
                          {a === "approval" ? "Approvals" : a.charAt(0).toUpperCase() + a.slice(1)}
                        </span>
                      ))}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {formatDate(d.start_date)} — {formatDate(d.end_date)}
                    {d.reason && <span className="ml-2 text-slate-300">· {d.reason}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Edit */}
                  <button
                    onClick={() => openEdit(d)}
                    className="px-2.5 py-1.5 text-[12px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                  >
                    Edit
                  </button>

                  {/* Toggle active */}
                  <button
                    onClick={() => toggleActive(d)}
                    disabled={!!toggling[d.id]}
                    className="p-1.5 rounded hover:bg-slate-50 transition-colors disabled:opacity-50"
                    title={d.is_active ? "Disable delegation" : "Enable delegation"}
                  >
                    {toggling[d.id]
                      ? <Loader2 size={16} className="animate-spin text-slate-400" />
                      : d.is_active
                        ? <ToggleRight size={18} className="text-indigo-500" />
                        : <ToggleLeft  size={18} className="text-slate-300" />
                    }
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(d.id)}
                    disabled={!!deleting[d.id]}
                    className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Remove delegation"
                  >
                    {deleting[d.id]
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {powers.length > 0 && delegations.length === 0 && !showForm && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100 p-10 flex flex-col items-center gap-2 text-center">
          <CalendarRange size={28} className="text-slate-300" />
          <p className="text-[13px] font-semibold text-slate-400">No delegations yet</p>
          <p className="text-[12px] text-slate-400">Click "Add Delegation" to delegate your powers when you're away.</p>
        </div>
      )}

    </div>
  );
}
