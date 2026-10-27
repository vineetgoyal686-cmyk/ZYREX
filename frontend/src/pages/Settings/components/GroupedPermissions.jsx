import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import api from "../../../utils/api";
import {
  PERMISSION_LAYOUT, SCOPE_PICKER_KEYS, OFFICE_SCOPE_KEYS, PERM_LABELS,
  GLOBAL_DASHBOARD_ORDER_KEYS, getModulePerms, PROFILE_SECTIONS,
} from "../constants";
import { useControlOwners, canGrantModule } from "../../../hooks/useControlOwners";
import ProjectScopePicker from "./ProjectScopePicker";

/*
 * Permission editor (Access Profiles, User Management). Laid out like the
 * sidebar: one card per sidebar section, one row per tab. Each tab gets one
 * level — None / View / Edit / Full — which sets its permissions;
 * "Custom" opens the single checkboxes for the rare in-between case.
 * Project tabs pick their projects on the row ("Projects ▾"); Orders and
 * Petty Cash can also pick offices.
 *
 * Settings pages (Projects, User Management, Numbering…) keep their
 * permissions in profile_permissions, not as modules: pass profilePerms +
 * onProfileChange(sectionKey, key, value) and they show as cards too
 * (key = view / add / edit / delete / manage_permissions).
 */

// Dashboard's own sub-permissions; its can_view follows them (the sidebar
// link is gated on can_view)
const DASHBOARD_PARTS = [
  { key: "order_overview_aging", label: "Order Overview & Aging" },
  { key: "order_intake",         label: "Intake" },
  { key: "order_payment",        label: "Payment" },
];

// What each level switches on (only the keys a tab actually has count)
const VIEW_KEYS = ["can_view", "can_log", "can_trash_view", "can_trash_log", ...GLOBAL_DASHBOARD_ORDER_KEYS];
const EDIT_KEYS = [...VIEW_KEYS,
  "can_add", "can_edit", "can_export", "can_bulk_upload", "can_download_document", "can_manage_columns",
  "can_take_action", "can_submit", "can_request", "can_request_recall", "can_request_amend", "can_request_cancel",
  "can_withdraw", "can_withdraw_recall", "can_withdraw_amend", "can_withdraw_cancel", "can_withdraw_submission"];
const LEVELS = [
  { id: "none", label: "None" },
  { id: "view", label: "View", keys: VIEW_KEYS, on: "bg-sky-600 text-white" },
  { id: "edit", label: "Edit", keys: EDIT_KEYS, on: "bg-amber-500 text-white" },
  { id: "full", label: "Full", on: "bg-emerald-600 text-white" },
];

// Orders' single permissions (Custom), by group — the group name says
// "Request" / "Withdraw" / "Trash", so the boxes keep short names
const ORDER_PERM_GROUPS = [
  { label: "Basic",    keys: ["can_view", "can_add", "can_edit", "can_delete"] },
  { label: "Request",  keys: ["can_request_recall", "can_request_amend", "can_request_cancel"] },
  { label: "Withdraw", keys: ["can_withdraw_recall", "can_withdraw_amend", "can_withdraw_cancel", "can_withdraw_submission"] },
  { label: "Utility",  keys: ["can_export", "can_download_document", "can_bulk_upload"] },
  { label: "Trash",    keys: ["can_trash_view", "can_trash_log", "can_trash_restore", "can_trash_delete"] },
];
const SHORT = {
  can_request_recall: "Recall", can_request_amend: "Amend", can_request_cancel: "Cancel",
  can_withdraw_recall: "Recall", can_withdraw_amend: "Amend", can_withdraw_cancel: "Cancel", can_withdraw_submission: "Submission",
};

// a row's `perms` (layout) narrows what it has
const ROW_PERMS = Object.fromEntries(PERMISSION_LAYOUT.flatMap(s => s.rows.flatMap(r => (r.group ? r.rows : [r])))
  .filter(r => r.perms).map(r => [r.key, r.perms]));
const permKeysOf = (mod) => (mod.profileKey ? mod.keys
  : mod.module_key === "global_dashboard" ? GLOBAL_DASHBOARD_ORDER_KEYS
  : ROW_PERMS[mod.module_key] || getModulePerms(mod.module_key));

// a Settings page's profile_permissions section, in the shape of a module
// row (its keys as can_view / can_add / … so the levels work the same)
const PROFILE_LABELS = Object.fromEntries(PROFILE_SECTIONS.flatMap(sec => sec.keys.map(({ k, label }) => [`can_${k}`, label])));
const profileItem = (sectionKey, perms) => {
  const sec = PROFILE_SECTIONS.find(x => x.key === sectionKey);
  if (!sec) return null;
  const keys = sec.keys.map(({ k }) => `can_${k}`);
  return {
    module_id: `profile:${sectionKey}`, module_key: `profile:${sectionKey}`, profileKey: sectionKey, keys,
    ...Object.fromEntries(sec.keys.map(({ k }) => [`can_${k}`, !!perms?.[sectionKey]?.[k]])),
  };
};

// the keys each level turns on for this tab; levels that would do the same
// as a lower one are left out (a View-only tab shows None / View)
const levelsOf = (mod) => {
  const keys = permKeysOf(mod);
  const seen = new Set();
  return LEVELS.map(l => ({ ...l, set: l.id === "none" ? [] : l.keys ? keys.filter(k => l.keys.includes(k)) : keys }))
    .filter(l => {
      const sig = l.set.slice().sort().join();
      if (l.id !== "none" && (!l.set.length || seen.has(sig))) return false;
      seen.add(sig);
      return true;
    });
};
const levelNow = (mod) => {
  const on = permKeysOf(mod).filter(k => mod[k]).sort().join();
  return levelsOf(mod).find(l => l.set.slice().sort().join() === on)?.id || "custom";
};

export default function GroupedPermissions({ modules: allModules, onChange, readOnly = false, allProjects = [], profilePerms = null, onProfileChange }) {
  // Control Center tabs show up only for their owners (and Global Admin)
  const owners = useControlOwners();
  const me = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const modules = owners ? allModules.filter(m => canGrantModule(owners, me, m.module_key)) : [];
  const byKey = Object.fromEntries(modules.map(m => [m.module_key, m]));
  // a layout row's item: its module, or a Settings page's profile section
  const itemOf = (row) => (row.profile ? (profilePerms && profileItem(row.profile, profilePerms)) : byKey[row.key]);
  const write = (mod, key, val) => (mod.profileKey
    ? onProfileChange?.(mod.profileKey, key.replace(/^can_/, ""), val)
    : onChange(mod.module_id, key, val));
  const [custom, setCustom] = useState({});     // module_key → single checkboxes open
  const [closed, setClosed] = useState({});     // section → collapsed

  // offices (Branch, type Office…) for Petty Cash's picker — live list
  const [offices, setOffices] = useState([]);
  useEffect(() => {
    api.get("/api/organisation/branches")
      .then(({ data }) => setOffices((data.branches || []).filter(b => String(b.status || "active").toLowerCase() === "active")
        .map(b => ({ id: b.id, projectCode: b.code || "", projectName: b.label || "" }))))
      .catch(() => {});
  }, []);

  // Dashboard keeps can_view in step with its parts
  const syncDashboard = (mod, next) => {
    if (mod.module_key === "global_dashboard") write(mod, "can_view", DASHBOARD_PARTS.some(p => next[p.key]));
  };
  const setOne = (mod, key, val) => {
    if (readOnly) return;
    write(mod, key, val);
    syncDashboard(mod, { ...mod, [key]: val });
  };
  const setLevel = (mod, levelId) => {
    if (readOnly) return;
    const level = levelsOf(mod).find(l => l.id === levelId) || levelsOf(mod)[levelsOf(mod).length - 1];
    const next = {};
    permKeysOf(mod).forEach(k => { next[k] = level.set.includes(k); write(mod, k, next[k]); });
    syncDashboard(mod, next);
  };

  const LevelPicker = ({ mod }) => {
    const now = levelNow(mod);
    return (
      <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
        {levelsOf(mod).map(l => (
          <button key={l.id} type="button" disabled={readOnly} onClick={() => setLevel(mod, l.id)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors disabled:cursor-default
              ${now === l.id ? (l.on || "bg-white text-slate-700 shadow-sm") : "text-slate-500 hover:text-slate-800"}`}>
            {l.label}
          </button>
        ))}
        {now === "custom" && <span className="px-2.5 py-1 rounded-md text-[12px] font-semibold bg-white text-slate-700 shadow-sm">Custom</span>}
      </div>
    );
  };

  const Box = ({ mod, k, label }) => (
    <label className={`flex items-center gap-1.5 min-w-0 select-none ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
      <input type="checkbox" checked={!!mod[k]} disabled={readOnly} onChange={e => setOne(mod, k, e.target.checked)}
        className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
      <span className="truncate text-[12px] text-slate-600">{label || PERM_LABELS[k] || PROFILE_LABELS[k] || k}</span>
    </label>
  );

  const singleBoxes = (mod) => {
    const cols = "grid grid-cols-2 gap-x-3 gap-y-1.5";
    if (mod.module_key === "global_dashboard") {
      return <div className="grid grid-cols-1 gap-y-1.5">{DASHBOARD_PARTS.map(p => <Box key={p.key} mod={mod} k={p.key} label={p.label} />)}</div>;
    }
    const keys = permKeysOf(mod);
    if (mod.module_key === "order") {
      return (
        <div className="divide-y divide-slate-100">
          {ORDER_PERM_GROUPS.map(g => {
            const ks = g.keys.filter(k => keys.includes(k));
            return ks.length > 0 && (
              <div key={g.label} className="py-2 first:pt-0 last:pb-0">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.label}</p>
                <div className={cols}>{ks.map(k => <Box key={k} mod={mod} k={k} label={SHORT[k]} />)}</div>
              </div>
            );
          })}
        </div>
      );
    }
    const label = (k) => (k.startsWith("can_trash_") ? `Trash ${PERM_LABELS[k]}` : undefined);
    return <div className={cols}>{keys.map(k => <Box key={k} mod={mod} k={k} label={label(k)} />)}</div>;
  };

  // one tab = one card: name and level on the same line; projects and
  // Custom (single checkboxes) below when they apply
  const tabCard = (row, mod) => {
    const canCustom = levelsOf(mod).length > 2 || mod.module_key === "global_dashboard";
    const open = custom[mod.module_key] || levelNow(mod) === "custom";
    const on = levelNow(mod) !== "none";
    const picker = SCOPE_PICKER_KEYS.includes(mod.module_key) && on;
    return (
      <div key={mod.module_id}
        className={`rounded-lg border p-3 transition-colors ${on ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold text-slate-800" title={row.label}>{row.label}</span>
          <div className="flex items-center gap-1 shrink-0">
            <LevelPicker mod={mod} />
            {canCustom && !readOnly && (
              <button type="button" title="Custom — pick single permissions"
                onClick={() => setCustom(c => ({ ...c, [mod.module_key]: !c[mod.module_key] }))}
                className={`p-1.5 rounded-md transition-colors ${open ? "bg-slate-200 text-slate-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>
                <SlidersHorizontal size={13} />
              </button>
            )}
          </div>
        </div>
        {picker && (
          <div className="mt-2">
            <ProjectScopePicker value={mod.scope ?? null} projects={allProjects} disabled={readOnly}
              offices={OFFICE_SCOPE_KEYS.includes(mod.module_key) ? offices : null}
              onChange={v => onChange(mod.module_id, "scope", v)} />
          </div>
        )}
        {open && canCustom && (
          <div className="mt-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5">{singleBoxes(mod)}</div>
        )}
      </div>
    );
  };
  const grid = (key, cards) => (
    <div key={key} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 items-start">{cards}</div>
  );

  return (
    <div className="space-y-3">
      {PERMISSION_LAYOUT.map(({ section, rows }) => {
        // only rows whose module exists (and may be granted by this user)
        const shown = rows.map(r => (r.group ? { ...r, rows: r.rows.filter(x => itemOf(x)) } : r))
          .filter(r => (r.group ? r.rows.length > 0 : itemOf(r)));
        if (!shown.length) return null;
        const sectionMods = shown.flatMap(r => (r.group ? r.rows.map(x => itemOf(x)) : [itemOf(r)]));
        const onCount = sectionMods.filter(m => levelNow(m) !== "none").length;
        const isClosed = !!closed[section];
        return (
          <div key={section} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50">
              <button type="button" onClick={() => setClosed(c => ({ ...c, [section]: !c[section] }))}
                className="flex items-center gap-2 text-left">
                {isClosed ? <ChevronRight size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                <span className="text-[12px] font-bold uppercase tracking-wider text-slate-600">{section}</span>
                <span className="text-[11px] font-medium text-slate-400">{onCount} of {sectionMods.length} on</span>
              </button>
              {!readOnly && !isClosed && (
                <div className="flex items-center gap-1">
                  {[["view", "All view"], ["full", "All full"], ["none", "Clear"]].map(([lvl, label]) => (
                    <button key={lvl} type="button" onClick={() => sectionMods.forEach(m => setLevel(m, lvl))}
                      className="h-7 px-2.5 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-white hover:text-slate-800">
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isClosed && (
              <div className="p-3 space-y-3 border-t border-slate-200">
                {/* plain tabs side by side; a sub-group gets its own heading */}
                {shown.reduce((blocks, r) => {
                  if (r.group) blocks.push({ group: r.group, rows: r.rows });
                  else if (blocks.length && !blocks[blocks.length - 1].group) blocks[blocks.length - 1].rows.push(r);
                  else blocks.push({ rows: [r] });
                  return blocks;
                }, []).map((blk, i) => (
                  <div key={blk.group || `b${i}`}>
                    {blk.group && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{blk.group}</p>}
                    {grid(blk.group || i, blk.rows.map(x => tabCard(x, itemOf(x))))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
