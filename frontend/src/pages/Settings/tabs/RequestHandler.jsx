import { useState, useEffect } from "react";
import { Inbox, Loader2, X, Plus, AlertCircle, Pencil, Check, RotateCcw } from "lucide-react";
import api from "../../../utils/api";
import BrandLoader from "../../../components/BrandLoader";

const ORDER_ACTIONS = [
  { key: "issue",  label: "Issue Order",          single: true  },
  { key: "recall", label: "Recall Request",       single: false },
  { key: "amend",  label: "Amend Request",        single: false },
  { key: "cancel", label: "Cancel Order Request", single: false },
];

const MODULES = [
  { key: "order",   label: "Order",   actions: ORDER_ACTIONS },
  { key: "intake",  label: "Intake",  actions: [] },
  { key: "payment", label: "Payment", actions: [] },
];

const DEFAULT = ""; // company dropdown value for the Default handlers

const Chevron = () => (
  <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </div>
);

export default function RequestHandler({ showToast, currentUser }) {
  const canEdit = ["global_admin","super_admin","admin"].includes(currentUser?.role)
    || !!currentUser?.profile_permissions?.request_handler?.edit;
  const [activeTab, setActiveTab]   = useState("order");
  const [config, setConfig]         = useState({});   // Default: module -> action -> { users }
  const [byCompany, setByCompany]   = useState({});   // companyId -> module -> action -> { users }
  const [companies, setCompanies]   = useState([]);
  const [companyId, setCompanyId]   = useState(DEFAULT);
  const [allUsers, setAllUsers]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState({});
  const [selected, setSelected]     = useState({});
  const [errors, setErrors]         = useState({});
  const [editMode, setEditMode]     = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cfgRes, usersRes, compRes] = await Promise.all([
        api.get("/api/request-handlers"),
        api.get("/api/users"),
        api.get("/api/procurement/companies").catch(() => ({ data: {} })),
      ]);
      setConfig(cfgRes.data.config || {});
      setByCompany(cfgRes.data.by_company || {});
      setAllUsers((usersRes.data.users || []).filter(u => u.is_active !== false));
      setCompanies(compRes.data.companies || []);
    } catch (err) {
      console.error("RequestHandler fetchData:", err);
    } finally {
      setLoading(false);
    }
  };

  const defaultUsers = (moduleKey, actionKey) => config[moduleKey]?.[actionKey]?.users || [];
  // The list being edited: the Default list, or the selected company's own list
  const ownUsers = (moduleKey, actionKey) => companyId
    ? byCompany[companyId]?.[moduleKey]?.[actionKey]?.users || []
    : defaultUsers(moduleKey, actionKey);

  const hasOwnHandlers = (cid) =>
    Object.values(byCompany[cid] || {}).some(mod => Object.values(mod || {}).some(a => a?.users?.length));

  const storeUsers = (moduleKey, action, users) => {
    const entry = { users, is_single: action.single };
    const merge = (prev) => ({ ...prev, [moduleKey]: { ...(prev[moduleKey] || {}), [action.key]: entry } });
    if (companyId) setByCompany(b => ({ ...b, [companyId]: merge(b[companyId] || {}) }));
    else setConfig(merge);
  };

  const saveUsers = (moduleKey, action, users) =>
    api.put("/api/request-handlers", {
      module_key: moduleKey,
      action_key: action.key,
      company_id: companyId || null,
      users,
      is_single:  action.single,
    });

  const addUser = async (moduleKey, action) => {
    const user = selected[action.key];
    if (!user) return;

    const current = ownUsers(moduleKey, action.key);
    if (!action.single && current.find(u => u.id === user.id)) {
      setErrors(e => ({ ...e, [action.key]: "User already assigned to this action." }));
      return;
    }

    setSaving(s => ({ ...s, [action.key]: true }));
    setErrors(e => ({ ...e, [action.key]: null }));

    try {
      const { data: vld } = await api.post("/api/request-handlers/validate-user", {
        module_key: moduleKey,
        action_key: action.key,
        user_id:    user.id,
      });

      if (!vld.valid) {
        setErrors(e => ({ ...e, [action.key]: vld.error }));
        return;
      }

      const newUsers = action.single
        ? [{ id: user.id, name: user.name }]
        : [...current, { id: user.id, name: user.name }];

      await saveUsers(moduleKey, action, newUsers);
      storeUsers(moduleKey, action, newUsers);
      setSelected(s => ({ ...s, [action.key]: null }));
    } catch (err) {
      setErrors(e => ({ ...e, [action.key]: err.response?.data?.error || "Failed to add user." }));
    } finally {
      setSaving(s => ({ ...s, [action.key]: false }));
    }
  };

  const removeUser = async (moduleKey, action, userId) => {
    const newUsers = ownUsers(moduleKey, action.key).filter(u => u.id !== userId);
    try {
      await saveUsers(moduleKey, action, newUsers);
      storeUsers(moduleKey, action, newUsers);
    } catch (err) {
      console.error("removeUser:", err);
      showToast?.(err.response?.data?.error || "Failed to remove user.", "error");
    }
  };

  // Company only: drop its own list so the Default handlers apply again
  const resetToDefault = async (moduleKey, action) => {
    setSaving(s => ({ ...s, [action.key]: true }));
    try {
      await saveUsers(moduleKey, action, []);
      storeUsers(moduleKey, action, []);
    } catch (err) {
      showToast?.(err.response?.data?.error || "Failed to reset.", "error");
    } finally {
      setSaving(s => ({ ...s, [action.key]: false }));
    }
  };

  const activeModule = MODULES.find(m => m.key === activeTab);
  const companyName = (c) => c.company_name || c.company_code || "Company";

  return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
            <Inbox size={18} className="text-indigo-600" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Request Handler</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Configure who handles each action — company-wise, or Default for all companies</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={companyId}
              onChange={e => { setCompanyId(e.target.value); setErrors({}); setSelected({}); }}
              className="appearance-none text-[12px] font-semibold border border-slate-300 rounded-sm pl-2.5 pr-7 h-8 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 max-w-[240px]">
              <option value={DEFAULT}>Default (all companies)</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {companyName(c)}{hasOwnHandlers(c.id) ? " • own handlers" : ""}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
          {canEdit && <button type="button"
            onClick={() => { setEditMode(e => !e); setErrors({}); setSelected({}); }}
            className={`inline-flex items-center gap-2 h-8 px-4 rounded-sm text-[12px] font-bold transition-colors
              ${editMode
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              }`}>
            {editMode
              ? <><Check size={13} strokeWidth={2.5} /> Done</>
              : <><Pencil size={13} strokeWidth={2} /> Edit</>
            }
          </button>}
        </div>
      </div>

      {/* Module Tabs */}
      <div className="flex border-b border-slate-200 px-6">
        {MODULES.map(m => (
          <button key={m.key} type="button"
            onClick={() => m.actions.length > 0 && setActiveTab(m.key)}
            disabled={m.actions.length === 0}
            className={`px-5 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors
              ${activeTab === m.key
                ? "border-indigo-600 text-indigo-700"
                : m.actions.length === 0
                  ? "border-transparent text-slate-300 cursor-not-allowed"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {companyId && !loading && activeModule.actions.length > 0 && (
          <p className="text-[11px] text-slate-500 mb-3">
            Orders of this company go to the handlers set here. Where none are set, the <span className="font-semibold">Default</span> handlers are used.
          </p>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
            <BrandLoader />
          </div>
        ) : activeModule.actions.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-sm p-10 text-center">
            <p className="text-sm font-semibold text-slate-400">Coming soon</p>
            <p className="text-xs text-slate-300 mt-1">Configuration for this module will be added later</p>
          </div>
        ) : (
          <div className="rounded-sm border border-slate-300 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-4 py-2.5 text-left text-[11px] font-bold text-slate-900 w-48 whitespace-nowrap">Action</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-left text-[11px] font-bold text-slate-900 w-20">Type</th>
                  <th className="border border-slate-300 px-4 py-2.5 text-left text-[11px] font-bold text-slate-900">Handler(s)</th>
                  {editMode && <th className="border border-slate-300 px-4 py-2.5 text-left text-[11px] font-bold text-slate-900 w-60 whitespace-nowrap">Add User</th>}
                </tr>
              </thead>
              <tbody>
                {activeModule.actions.map((action) => {
                  const users     = ownUsers(activeTab, action.key);
                  const usingDefault = !!companyId && users.length === 0;
                  const fallback  = usingDefault ? defaultUsers(activeTab, action.key) : [];
                  const isSaving  = !!saving[action.key];
                  const error     = errors[action.key];
                  const selUser   = selected[action.key];
                  const dropdownUsers = action.single
                    ? allUsers
                    : allUsers.filter(u => !users.find(au => au.id === u.id));

                  return (
                    <tr key={action.key} className="bg-white hover:bg-slate-50/40 align-top">

                      {/* Action name */}
                      <td className="border border-slate-200 px-4 py-3">
                        <p className="text-[13px] font-semibold text-slate-800">{action.label}</p>
                        {action.single && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Replaces existing if changed</p>
                        )}
                      </td>

                      {/* Type badge */}
                      <td className="border border-slate-200 px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap
                          ${action.single
                            ? "bg-violet-100 text-violet-700"
                            : "bg-emerald-100 text-emerald-700"}`}>
                          {action.single ? "Single" : "Multiple"}
                        </span>
                      </td>

                      {/* Assigned users */}
                      <td className="border border-slate-200 px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                          {usingDefault ? (
                            <>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Default</span>
                              {fallback.length === 0
                                ? <span className="text-[12px] text-slate-400 italic">None assigned</span>
                                : fallback.map(u => (
                                  <span key={u.id} className="px-2 py-0.5 border border-dashed border-slate-300 rounded text-[11px] font-medium text-slate-400">{u.name}</span>
                                ))}
                            </>
                          ) : users.length === 0 ? (
                            <span className="text-[12px] text-slate-400 italic">None assigned</span>
                          ) : users.map(u => (
                            <span key={u.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-medium text-slate-700">
                              {u.name}
                              {editMode && (
                                <button type="button" onClick={() => removeUser(activeTab, action, u.id)}
                                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-slate-300 text-slate-400 hover:text-slate-600 transition shrink-0 ml-0.5">
                                  <X size={9} strokeWidth={3} />
                                </button>
                              )}
                            </span>
                          ))}
                          {editMode && companyId && !usingDefault && (
                            <button type="button" onClick={() => resetToDefault(activeTab, action)} disabled={isSaving}
                              title="Remove this company's handlers and use the Default ones"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-600 ml-1 disabled:opacity-40">
                              <RotateCcw size={10} strokeWidth={2.5} /> Use Default
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Add user — only in edit mode */}
                      {editMode && <td className="border border-slate-200 px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <select
                                value={selUser?.id || ""}
                                onChange={e => {
                                  const u = allUsers.find(u => u.id === e.target.value);
                                  setSelected(s => ({ ...s, [action.key]: u || null }));
                                  setErrors(er => ({ ...er, [action.key]: null }));
                                }}
                                className="w-full appearance-none text-[12px] border border-slate-300 rounded-sm pl-2.5 pr-7 py-1.5 h-[30px] bg-white text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200">
                                <option value="">Select user...</option>
                                {dropdownUsers.map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                              <Chevron />
                            </div>
                            <button type="button"
                              onClick={() => addUser(activeTab, action)}
                              disabled={!selUser || isSaving}
                              className="h-[30px] w-[30px] shrink-0 flex items-center justify-center rounded-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.5} />}
                            </button>
                          </div>
                          {error && (
                            <div className="flex items-start gap-1.5 text-[10px] text-rose-600 font-medium leading-snug">
                              <AlertCircle size={11} className="shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          )}
                        </div>
                      </td>}

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
