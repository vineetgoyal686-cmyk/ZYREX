import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ShieldCheck, Plus, X, Search, Save } from "lucide-react";
import api from "../../../utils/api";
import { MODULE_SECTIONS } from "../constants";
import { refreshControlOwners } from "../../../hooks/useControlOwners";

/*
 * Control Center (Global Admin only). A tab / sub-tab added here gets
 * owners: only they (and Global Admin) can grant, change or remove its
 * permissions, and nobody gets it automatically by role. Tabs not added
 * here work as before. Choosing a tab selects all its sub-tabs; untick a
 * sub-tab to leave it normal, or give it different owners.
 */

const ALL_KEYS = MODULE_SECTIONS.flatMap(s => s.groups.flatMap(g => g.keys));

// Owner chips + "Add" dropdown with search
function OwnerPicker({ value, users, onAdd, onRemove, placeholder = "Add owner" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const options = users.filter(u => !value.includes(u.id) &&
    (!q || u.name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="flex flex-wrap items-center gap-1.5" ref={ref}>
      {value.map(id => (
        <span key={id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[12px] font-medium text-indigo-700">
          {byId[id]?.name || "Unknown user"}
          <button type="button" onClick={() => onRemove(id)} title="Remove owner"
            className="p-0.5 rounded-full hover:bg-indigo-100"><X size={11} /></button>
        </span>
      ))}
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-[12px] text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
          <Plus size={11} /> {placeholder}
        </button>
        {open && (
          <div className="absolute z-30 left-0 mt-1 w-64 bg-white border border-slate-200 rounded-sm shadow-xl">
            <div className="relative border-b border-slate-100">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search user..."
                className="w-full pl-8 pr-2 py-2 text-[12px] outline-none" />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {options.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-slate-400">No users</p>
              ) : options.map(u => (
                <button key={u.id} type="button" onClick={() => { onAdd(u.id); setQ(""); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50">
                  <p className="text-[12px] font-semibold text-slate-700">{u.name}</p>
                  <p className="text-[11px] text-slate-400">{u.email}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ControlCenter({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [users, setUsers]     = useState([]);
  const [names, setNames]     = useState({});
  // { module_key: [user_id] } — a key present (even with []) is ticked
  const [draft, setDraft]     = useState({});
  const [saved, setSaved]     = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [ownersRes, usersRes, modsRes] = await Promise.all([
          api.get("/api/control-center"),
          api.get("/api/users"),
          api.get("/api/users/modules/list"),
        ]);
        const owners = ownersRes.data.owners || {};
        setDraft(owners);
        setSaved(owners);
        setUsers((usersRes.data.users || []).filter(u => u.is_active !== false && u.role !== "global_admin"));
        setNames(Object.fromEntries((modsRes.data.modules || []).map(m => [m.module_key, m.module_name])));
      } catch {
        showToast?.("Failed to load Control Center", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = useMemo(() => JSON.stringify(normalise(draft)) !== JSON.stringify(normalise(saved)), [draft, saved]);

  const setKey = (key, ids) => setDraft(d => ({ ...d, [key]: ids }));
  const untick = (key) => setDraft(d => { const n = { ...d }; delete n[key]; return n; });

  const toggleGroup = (keys, on) => setDraft(d => {
    const n = { ...d };
    if (on) {
      const groupOwners = commonOwners(keys.filter(k => n[k]), n);
      keys.forEach(k => { if (!n[k]) n[k] = [...groupOwners]; });
    } else {
      keys.forEach(k => { delete n[k]; });
    }
    return n;
  });

  const addGroupOwner = (keys, id) => setDraft(d => {
    const n = { ...d };
    keys.filter(k => n[k]).forEach(k => { if (!n[k].includes(id)) n[k] = [...n[k], id]; });
    return n;
  });
  const removeGroupOwner = (keys, id) => setDraft(d => {
    const n = { ...d };
    keys.filter(k => n[k]).forEach(k => { n[k] = n[k].filter(x => x !== id); });
    return n;
  });

  const save = async () => {
    const empty = Object.entries(draft).filter(([, ids]) => ids.length === 0).map(([k]) => names[k] || k);
    if (empty.length) {
      showToast?.(`Choose at least one owner for: ${empty.join(", ")}`, "error");
      return;
    }
    setSaving(true);
    try {
      // Send every known key so unticked ones go back to normal
      const keys = new Set([...ALL_KEYS, ...Object.keys(saved), ...Object.keys(draft)]);
      const owners = Object.fromEntries([...keys].map(k => [k, draft[k] || []]));
      await api.put("/api/control-center", { owners });
      setSaved(draft);
      refreshControlOwners();
      showToast?.("Control Center saved");
    } catch (e) {
      showToast?.(e.response?.data?.error || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  // Tab | Owners | Status — stacks on mobile
  const row = "flex flex-col md:grid md:grid-cols-[minmax(240px,300px)_1fr_110px] md:items-center gap-2 md:gap-4";

  return (
    <div className="flex flex-col h-full">

      {/* Sticky header — same as User Management */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* 3D tile: gradient body, top gloss, darker base edge, soft drop shadow */}
          <div className="relative w-10 h-10 shrink-0 rounded-xl bg-linear-to-br from-indigo-500 via-violet-600 to-fuchsia-600
            shadow-[0_6px_14px_-4px_rgba(124,58,237,0.55),inset_0_-3px_0_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.35)]
            flex items-center justify-center overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/30 to-transparent" />
            <ShieldCheck size={20} strokeWidth={2.4} className="relative text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]" />
          </div>
          <h2 className="min-w-0 text-[18px] font-black tracking-tight truncate bg-linear-to-r from-slate-900 via-indigo-800 to-violet-700 bg-clip-text text-transparent">
            Control Center
          </h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {dirty && !saving && (
            <>
              <span className="hidden sm:inline text-[12px] font-medium text-amber-600">Unsaved changes</span>
              <button type="button" onClick={() => setDraft(saved)}
                className="px-4 py-2 rounded-sm text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                Discard
              </button>
            </>
          )}
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#f0f2f5] p-5 flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-blue-500" /></div>
        ) : (
          <>
            {MODULE_SECTIONS.map(({ section, groups }) => (
              <div key={section} className="bg-white border border-slate-200">
                <div className={`${row} px-4 py-2.5 bg-slate-50 border-b border-slate-200`}>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section}</span>
                  <span className="hidden md:block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Owners</span>
                  <span className="hidden md:block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
                </div>

                {groups.map(group => {
                  const keys = group.keys;
                  const ticked = keys.filter(k => draft[k]);
                  const allOn = ticked.length === keys.length;
                  const someOn = ticked.length > 0;
                  const multi = keys.length > 1;
                  const groupOwners = commonOwners(ticked, draft);
                  return (
                    <div key={group.label} className="border-b border-slate-100 last:border-b-0">
                      <div className={`${row} px-4 py-3`}>
                        <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                          <input type="checkbox" checked={someOn}
                            ref={el => { if (el) el.indeterminate = someOn && !allOn; }}
                            onChange={e => toggleGroup(keys, e.target.checked)}
                            className="w-4 h-4 accent-blue-600 shrink-0" />
                          <span className="text-[13px] font-semibold text-slate-800">{group.label}</span>
                          {multi && <span className="text-[11px] text-slate-400">{keys.length} sub-tabs</span>}
                        </label>
                        <div className="min-w-0">
                          {someOn ? (
                            <OwnerPicker value={groupOwners} users={users}
                              placeholder={multi ? "Add owner to all" : "Add owner"}
                              onAdd={id => addGroupOwner(keys, id)}
                              onRemove={id => removeGroupOwner(keys, id)} />
                          ) : <span className="text-[12px] text-slate-300">—</span>}
                        </div>
                        <StatusBadge state={allOn ? "on" : someOn ? "part" : "off"} />
                      </div>

                      {multi && someOn && (
                        <div className="bg-slate-50/70 border-t border-slate-100">
                          {keys.map(k => (
                            <div key={k} className={`${row} pl-11 pr-4 py-2 border-b border-slate-100 last:border-b-0`}>
                              <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                                <input type="checkbox" checked={!!draft[k]}
                                  onChange={e => e.target.checked ? setKey(k, [...groupOwners]) : untick(k)}
                                  className="w-3.5 h-3.5 accent-blue-600 shrink-0" />
                                <span className={`text-[12px] ${draft[k] ? "text-slate-700 font-medium" : "text-slate-400"}`}>{names[k] || k}</span>
                              </label>
                              <div className="min-w-0">
                                {draft[k] ? (
                                  <OwnerPicker value={draft[k]} users={users}
                                    onAdd={id => setKey(k, [...draft[k], id])}
                                    onRemove={id => setKey(k, draft[k].filter(x => x !== id))} />
                                ) : <span className="text-[12px] text-slate-300">—</span>}
                              </div>
                              <StatusBadge state={draft[k] ? "on" : "off"} small />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ state, small }) {
  const s = {
    on:   { label: "Controlled", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    part: { label: "Partly",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
    off:  { label: "Normal",     cls: "bg-slate-50 text-slate-500 border-slate-200" },
  }[state];
  return (
    <span className={`justify-self-start self-start md:self-auto inline-flex items-center px-2 py-0.5 rounded-full border font-semibold ${small ? "text-[10px]" : "text-[11px]"} ${s.cls}`}>
      {s.label}
    </span>
  );
}

// Owners every one of these keys shares
function commonOwners(keys, draft) {
  if (!keys.length) return [];
  return (draft[keys[0]] || []).filter(id => keys.every(k => (draft[k] || []).includes(id)));
}

// Order-insensitive form of a draft, for the unsaved-changes check
function normalise(d) {
  return Object.keys(d).sort().map(k => [k, [...d[k]].sort()]);
}
