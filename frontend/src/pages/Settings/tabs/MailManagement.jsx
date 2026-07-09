import { useState, useEffect } from "react";
import { Mail, Loader2, X, Plus, Pencil, Check, ChevronDown } from "lucide-react";
import api from "../../../utils/api";

// Groups events under a heading per request-type. `main` events show right away;
// `more` events (approve/reject/revert outcomes) are tucked behind "More options"
// since most admins only ever touch the request/withdraw pair.
const ORDER_GROUPS = [
  { label: "Amend Request",  main: ["amend_request", "amend_withdraw"],   more: ["amend_approved", "amend_rejected", "amend_direct"] },
  { label: "Cancel Request", main: ["cancel_request", "cancel_withdraw"], more: ["cancel_approved", "cancel_rejected"] },
  { label: "Recall Request", main: ["recall_request", "recall_withdraw"], more: ["recall_approved", "recall_rejected"] },
  { label: "Approval Flow",  main: ["approval_request", "approval_withdraw"], more: ["approval_approved", "approval_rejected", "approval_reverted"] },
  { label: "Issue",          main: ["issue_ready"],                        more: ["issue_issued", "issue_reverted", "issue_rejected"] },
];

const MODULES = [
  { key: "order",   label: "Order",   groups: ORDER_GROUPS },
  { key: "intake",  label: "Intake",  groups: [] },
  { key: "payment", label: "Payment", groups: [] },
];

export default function MailManagement({ showToast, currentUser }) {
  const canEdit = ["global_admin", "super_admin", "admin"].includes(currentUser?.role)
    || !!currentUser?.profile_permissions?.mail_management?.edit;

  const [activeTab, setActiveTab] = useState("order");
  const [events,    setEvents]    = useState({}); // key -> { label, defaultEnabled, fixedTo }
  const [config,    setConfig]    = useState({});
  const [allUsers,  setAllUsers]  = useState([]);
  const [handlers,  setHandlers]  = useState({}); // module -> action_key -> { users }
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState({});
  const [selected,  setSelected]  = useState({});
  const [editMode,  setEditMode]  = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [showMore, setShowMore] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsRes, cfgRes, usersRes, handlersRes] = await Promise.all([
        api.get("/api/mail-management/events"),
        api.get("/api/mail-management"),
        api.get("/api/users"),
        api.get("/api/request-handlers"),
      ]);
      const eventMap = {};
      (eventsRes.data.events || []).forEach(e => { eventMap[e.key] = e; });
      setEvents(eventMap);
      setConfig(cfgRes.data.config || {});
      setAllUsers((usersRes.data.users || []).filter(u => u.is_active !== false));
      setHandlers(handlersRes.data.config || {});
      setOpenGroups(prev => Object.keys(prev).length ? prev : { [ORDER_GROUPS[0].label]: true });
    } catch (err) {
      console.error("MailManagement fetchData:", err);
    } finally {
      setLoading(false);
    }
  };

  const getEntry = (moduleKey, eventKey) => {
    const saved = config[moduleKey]?.[eventKey];
    if (saved) return saved;
    return { enabled: events[eventKey]?.defaultEnabled ?? true, extra_to: [], extra_cc: [] };
  };

  const saveEntry = async (moduleKey, eventKey, patch) => {
    const current = getEntry(moduleKey, eventKey);
    const next = { ...current, ...patch };
    setSaving(s => ({ ...s, [eventKey]: true }));
    try {
      await api.put("/api/mail-management", {
        module_key: moduleKey,
        action_key: eventKey,
        enabled:    next.enabled,
        extra_to:   next.extra_to,
        extra_cc:   next.extra_cc,
      });
      setConfig(c => ({
        ...c,
        [moduleKey]: { ...(c[moduleKey] || {}), [eventKey]: next },
      }));
    } catch (err) {
      showToast?.(err.response?.data?.error || "Failed to save", "error");
    } finally {
      setSaving(s => ({ ...s, [eventKey]: false }));
    }
  };

  const toggleEnabled = (moduleKey, eventKey) => {
    const current = getEntry(moduleKey, eventKey);
    saveEntry(moduleKey, eventKey, { enabled: !current.enabled });
  };

  const addRecipient = (moduleKey, eventKey, field) => {
    const selKey = `${eventKey}_${field}`;
    const user = selected[selKey];
    if (!user) return;
    const current = getEntry(moduleKey, eventKey);
    const list = current[field] || [];
    if (list.find(u => u.id === user.id)) return;
    saveEntry(moduleKey, eventKey, { [field]: [...list, { id: user.id, name: user.name, email: user.email }] });
    setSelected(s => ({ ...s, [selKey]: null }));
  };

  const removeRecipient = (moduleKey, eventKey, field, userId) => {
    const current = getEntry(moduleKey, eventKey);
    saveEntry(moduleKey, eventKey, { [field]: (current[field] || []).filter(u => u.id !== userId) });
  };

  const activeModule = MODULES.find(m => m.key === activeTab);
  const toggleGroup = (label) => setOpenGroups(g => ({ ...g, [label]: !g[label] }));

  const RecipientRow = ({ moduleKey, eventKey, field, label, fixedChips = [] }) => {
    const entry = getEntry(moduleKey, eventKey);
    const list  = entry[field] || [];
    const selKey = `${eventKey}_${field}`;
    const dropdownUsers = allUsers.filter(u => !list.find(au => au.id === u.id));
    return (
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide w-6 shrink-0 pt-0.5">{label}</span>
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {fixedChips.map((c, i) => (
            <span key={`fixed-${i}`} title="Always included — fixed by the system" className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[11px] font-medium text-indigo-700">
              {c}
            </span>
          ))}
          {list.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-medium text-slate-700">
              {u.name}
              {editMode && (
                <button type="button" onClick={() => removeRecipient(moduleKey, eventKey, field, u.id)}
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-slate-300 text-slate-400 hover:text-slate-600 transition shrink-0 ml-0.5">
                  <X size={9} strokeWidth={3} />
                </button>
              )}
            </span>
          ))}
          {list.length === 0 && fixedChips.length === 0 && !editMode && <span className="text-[11px] text-slate-400 italic">None</span>}
          {editMode && (
            <div className="inline-flex items-center gap-1">
              <select
                value={selected[selKey]?.id || ""}
                onChange={e => {
                  const u = allUsers.find(u => u.id === e.target.value);
                  setSelected(s => ({ ...s, [selKey]: u || null }));
                }}
                className="appearance-none text-[11px] border border-slate-300 rounded-sm pl-2 pr-6 py-1 h-[26px] bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
                <option value="">+ Add person...</option>
                {dropdownUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button type="button"
                onClick={() => addRecipient(moduleKey, eventKey, field)}
                disabled={!selected[selKey]}
                className="h-[26px] w-[26px] shrink-0 flex items-center justify-center rounded-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <Plus size={12} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // The "always sent to" names for the TO row — either the real Request Handler
  // name(s), or a plain description when the recipient varies per-order (the
  // original requester, whichever approval level is currently pending).
  const fixedToChips = (moduleKey, fixedTo) => {
    if (!fixedTo) return [];
    if (fixedTo.type === "handler") {
      const users = handlers[moduleKey]?.[fixedTo.key]?.users || [];
      return users.length ? users.map(u => u.name) : ["No handler set"];
    }
    return [fixedTo.label];
  };

  const EventRow = ({ moduleKey, eventKey }) => {
    const entry = getEntry(moduleKey, eventKey);
    const isSaving = !!saving[eventKey];
    const meta = events[eventKey];
    return (
      <div className="py-3 px-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-slate-800">{meta?.label || eventKey}</p>
          <button type="button"
            disabled={!editMode || isSaving}
            onClick={() => toggleEnabled(moduleKey, eventKey)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors shrink-0
              ${entry.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}
              ${editMode ? "cursor-pointer" : "cursor-default"}`}>
            {isSaving ? <Loader2 size={10} className="animate-spin" /> : null}
            {entry.enabled ? "On" : "Off"}
          </button>
        </div>
        <RecipientRow moduleKey={moduleKey} eventKey={eventKey} field="extra_to" label="To" fixedChips={fixedToChips(moduleKey, meta?.fixedTo)} />
        <RecipientRow moduleKey={moduleKey} eventKey={eventKey} field="extra_cc" label="Cc" fixedChips={meta?.fixedTo?.type === "text" && meta.fixedTo.label === "Order Creator" ? [] : ["Order Creator"]} />
      </div>
    );
  };

  return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
            <Mail size={18} className="text-indigo-600" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Mail Management</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Turn each event's email on/off, and add extra recipients on top of the fixed ones</p>
          </div>
        </div>
        {canEdit && <button type="button"
          onClick={() => { setEditMode(e => !e); setSelected({}); }}
          className={`inline-flex items-center gap-2 h-8 px-4 rounded-sm text-[12px] font-bold transition-colors
            ${editMode
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400"
            }`}>
          {editMode ? <><Check size={13} strokeWidth={2.5} /> Done</> : <><Pencil size={13} strokeWidth={2} /> Edit</>}
        </button>}
      </div>

      {/* Module Tabs */}
      <div className="flex border-b border-slate-200 px-6">
        {MODULES.map(m => (
          <button key={m.key} type="button"
            onClick={() => m.groups.length > 0 && setActiveTab(m.key)}
            disabled={m.groups.length === 0}
            className={`px-5 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors
              ${activeTab === m.key
                ? "border-indigo-600 text-indigo-700"
                : m.groups.length === 0
                  ? "border-transparent text-slate-300 cursor-not-allowed"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : activeModule.groups.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-sm p-10 text-center">
            <p className="text-sm font-semibold text-slate-400">Coming soon</p>
            <p className="text-xs text-slate-300 mt-1">Configuration for this module will be added later</p>
          </div>
        ) : (
          activeModule.groups.map(group => {
            const open = !!openGroups[group.label];
            const moreOpen = !!showMore[group.label];
            return (
              <div key={group.label} className="rounded-sm border border-slate-300 overflow-hidden">
                <button type="button" onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-100 hover:bg-slate-200/70 transition-colors">
                  <span className="text-[13px] font-bold text-slate-800">{group.label}</span>
                  <ChevronDown size={15} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="divide-y divide-slate-200 bg-white">
                    {group.main.map(eventKey => (
                      <EventRow key={eventKey} moduleKey={activeTab} eventKey={eventKey} />
                    ))}

                    {group.more.length > 0 && (
                      <div>
                        {moreOpen && group.more.map(eventKey => (
                          <div key={eventKey} className="border-t border-dashed border-slate-200">
                            <EventRow moduleKey={activeTab} eventKey={eventKey} />
                          </div>
                        ))}
                        <button type="button"
                          onClick={() => setShowMore(s => ({ ...s, [group.label]: !s[group.label] }))}
                          className="w-full text-left px-4 py-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50/50 transition-colors">
                          {moreOpen ? "Hide more options" : `More options (${group.more.length})`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
