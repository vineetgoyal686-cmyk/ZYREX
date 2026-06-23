import { useState, useEffect } from "react";
import { Inbox, Loader2, X, Plus, AlertCircle, Pencil, Check } from "lucide-react";
import api from "../../../utils/api";

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

export default function RequestHandler({ showToast, currentUser }) {
  const canEdit = ["global_admin","super_admin","admin"].includes(currentUser?.role)
    || !!currentUser?.profile_permissions?.request_handler?.edit;
  const [activeTab, setActiveTab]   = useState("order");
  const [config, setConfig]         = useState({});
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
      const [cfgRes, usersRes] = await Promise.all([
        api.get("/api/request-handlers"),
        api.get("/api/users"),
      ]);
      setConfig(cfgRes.data.config || {});
      setAllUsers((usersRes.data.users || []).filter(u => u.is_active !== false));
    } catch (err) {
      console.error("RequestHandler fetchData:", err);
    } finally {
      setLoading(false);
    }
  };

  const getUsers = (moduleKey, actionKey) =>
    config[moduleKey]?.[actionKey]?.users || [];

  const addUser = async (moduleKey, action) => {
    const user = selected[action.key];
    if (!user) return;

    const current = getUsers(moduleKey, action.key);
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

      await api.put("/api/request-handlers", {
        module_key: moduleKey,
        action_key: action.key,
        users:      newUsers,
        is_single:  action.single,
      });

      setConfig(c => ({
        ...c,
        [moduleKey]: {
          ...(c[moduleKey] || {}),
          [action.key]: { users: newUsers, is_single: action.single },
        },
      }));
      setSelected(s => ({ ...s, [action.key]: null }));
    } catch (err) {
      setErrors(e => ({ ...e, [action.key]: err.response?.data?.error || "Failed to add user." }));
    } finally {
      setSaving(s => ({ ...s, [action.key]: false }));
    }
  };

  const removeUser = async (moduleKey, action, userId) => {
    const newUsers = getUsers(moduleKey, action.key).filter(u => u.id !== userId);
    try {
      await api.put("/api/request-handlers", {
        module_key: moduleKey,
        action_key: action.key,
        users:      newUsers,
        is_single:  action.single,
      });
      setConfig(c => ({
        ...c,
        [moduleKey]: {
          ...(c[moduleKey] || {}),
          [action.key]: { users: newUsers, is_single: action.single },
        },
      }));
    } catch (err) {
      console.error("removeUser:", err);
    }
  };

  const activeModule = MODULES.find(m => m.key === activeTab);

  return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
            <Inbox size={18} className="text-indigo-600" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Request Handler</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Configure who handles each action for each module</p>
          </div>
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
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : activeModule.actions.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-sm p-10 text-center">
            <p className="text-sm font-semibold text-slate-400">Coming soon</p>
            <p className="text-xs text-slate-300 mt-1">Configuration for this module will be added later</p>
          </div>
        ) : (
          <div className="rounded-sm border border-slate-300 overflow-hidden">
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
                  const users    = getUsers(activeTab, action.key);
                  const isSaving = !!saving[action.key];
                  const error    = errors[action.key];
                  const selUser  = selected[action.key];
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
                          {users.length === 0 ? (
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
                              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
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
