import {
  MODULE_SECTIONS, PERM_COLOR, PERM_LABELS,
  GLOBAL_DASHBOARD_ORDER_KEYS, GLOBAL_DASHBOARD_ORDER_LABELS,
  getModulePerms, getModulePermKeysFull, isModuleBuilt,
} from "../constants";

export default function GroupedPermissions({ modules, onChange, readOnly = false, allProjects = [], selectedProjects = [], onProjectChange }) {
  const allSectionKeys = MODULE_SECTIONS.flatMap(s => s.groups.flatMap(g => g.keys));
  const ungrouped = modules.filter(m => !allSectionKeys.includes(m.module_key));

  const toggleAllSection = (groupKeys, val) => {
    if (readOnly) return;
    modules.filter(m => groupKeys.includes(m.module_key)).forEach(m => {
      getModulePermKeysFull(m).forEach(k => onChange(m.module_id, k, val));
    });
  };

  const renderRow = (mod) => {
    if (mod.module_key === "global_dashboard") {
      const overviewChecked = !!mod.order_overview_aging;
      const intakeChecked   = !!mod.order_intake;
      const paymentChecked  = !!mod.order_payment;

      const chk = (key, checked) => (
        <label className={`flex items-center gap-1.5 select-none ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
          <input type="checkbox" checked={checked} disabled={readOnly}
            onChange={(e) => !readOnly && onChange(mod.module_id, key, e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer disabled:cursor-not-allowed" />
          <span className="text-[11px] text-slate-500 font-medium">View</span>
        </label>
      );

      return (
        <div key={mod.module_id} className="w-full flex flex-col">
          <div className="rounded-sm border border-slate-300 bg-slate-50 p-3.5 flex-1">

            {/* Card header */}
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-400">
              <p className="text-[13px] font-bold text-slate-800">Global Dashboard</p>
              {!readOnly && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-sm hover:bg-slate-100/70 transition">
                  <input type="checkbox"
                    checked={overviewChecked && intakeChecked && paymentChecked}
                    onChange={(e) => {
                      onChange(mod.module_id, "order_overview_aging", e.target.checked);
                      onChange(mod.module_id, "order_intake", e.target.checked);
                      onChange(mod.module_id, "order_payment", e.target.checked);
                    }}
                    className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
                </label>
              )}
            </div>

            {/* Order — outer box, two inner boxes */}
            <div className="mb-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Order</p>
              <div className="flex gap-2">
                <div className={`flex-1 rounded-sm border px-3 py-2.5 ${overviewChecked ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
                  <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Overview</p>
                  {chk("order_overview_aging", overviewChecked)}
                </div>
                <div className={`flex-1 rounded-sm border px-3 py-2.5 ${overviewChecked ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
                  <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Aging</p>
                  {chk("order_overview_aging", overviewChecked)}
                </div>
              </div>
            </div>

            {/* Intake + Payment — same row, side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Intake</p>
                <div className={`rounded-sm border px-3 py-2.5 ${intakeChecked ? "border-blue-200" : "border-slate-200"} bg-white`}>
                  {chk("order_intake", intakeChecked)}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Payment</p>
                <div className={`rounded-sm border px-3 py-2.5 ${paymentChecked ? "border-blue-200" : "border-slate-200"} bg-white`}>
                  {chk("order_payment", paymentChecked)}
                </div>
              </div>
            </div>

          </div>
        </div>
      );
    }

    if (mod.module_key === "order") return renderOrderCard(mod);

    const availKeys = getModulePerms(mod.module_key);
    const built = isModuleBuilt(mod.module_key);
    const allChecked = availKeys.every(k => mod[k]);
    const anyChecked = availKeys.some(k => mod[k]);
    return (
      <div key={mod.module_id}
        className={`rounded-sm border p-3.5 transition-all
          ${!built ? "border-amber-100 bg-amber-50/30" : anyChecked ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
        <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-[13px] font-bold ${built ? "text-slate-800" : "text-slate-500"}`}>
                {mod.module_name}
              </p>
              {!built && (
                <span title="Module not yet implemented — only View applies"
                  className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase tracking-widest border border-amber-200">
                  Soon
                </span>
              )}
            </div>
          </div>
          {availKeys.length > 1 && !readOnly && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-sm hover:bg-slate-100/70 transition">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                onChange={e => availKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
          {availKeys.map(key => (
            <label key={key}
              className={`flex items-center gap-2 select-none group px-1.5 py-1 rounded-sm transition ${readOnly ? "cursor-default opacity-90" : "cursor-pointer hover:bg-white/80"}`}>
              <input type="checkbox" checked={mod[key] || false} disabled={readOnly}
                onChange={e => !readOnly && onChange(mod.module_id, key, e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer transition-transform group-active:scale-90 disabled:cursor-not-allowed" />
              <span className={`text-[11px] font-semibold ${PERM_COLOR[key] || "text-slate-500"} ${readOnly ? "" : "group-hover:opacity-80"} transition`}>
                {PERM_LABELS[key]}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const MASTER_DATA_NAMES = {
    master_data_vendor:     "Vendor Master",
    master_data_products:   "Product Master",
    master_data_orders_tab: "Order Master",
    master_data_intakes:    "Item Master",
    master_data_clauses:    "Clauses Master",
  };

  const MASTER_DATA_COLUMNS = [
    { key: "can_view",        label: "View"        },
    { key: "can_add",         label: "Create"      },
    { key: "can_bulk_upload", label: "Bulk Upload" },
    { key: "can_export",      label: "Export"      },
  ];

  const renderMasterDataTable = (groupMods) => (
    <div className="rounded-sm border border-slate-300 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-3 py-2 text-center text-[11px] font-bold text-slate-900 w-10">S.No</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-[11px] font-bold text-slate-900 w-44">Module</th>
            {MASTER_DATA_COLUMNS.map(col => (
              <th key={col.key} className="border border-slate-300 px-2 py-2 text-center text-[11px] font-bold text-slate-900 whitespace-nowrap">
                {col.label}
              </th>
            ))}
            {!readOnly && <th className="border border-slate-300 px-2 py-2 text-[11px] font-bold text-slate-900 text-center">All</th>}
          </tr>
        </thead>
        <tbody>
          {groupMods.map((mod, i) => {
            const availKeys = getModulePerms(mod.module_key);
            const allChecked = availKeys.every(k => mod[k]);
            const anyChecked = availKeys.some(k => mod[k]);
            const displayName = MASTER_DATA_NAMES[mod.module_key] || mod.module_name;
            return (
              <tr key={mod.module_id}
                className={`transition-colors ${anyChecked ? "bg-blue-50/40" : i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} hover:bg-blue-50/50`}>
                <td className="border border-slate-200 px-3 py-2.5 text-center text-[12px] font-semibold text-slate-500 tabular-nums">{i + 1}</td>
                <td className="border border-slate-200 px-3 py-2.5">
                  <span className="text-[12px] font-semibold text-slate-700">{displayName}</span>
                </td>
                {MASTER_DATA_COLUMNS.map(col => {
                  const applicable = availKeys.includes(col.key);
                  return (
                    <td key={col.key} className="border border-slate-200 text-center px-2 py-2.5">
                      {applicable ? (
                        <input type="checkbox" checked={mod[col.key] || false} disabled={readOnly}
                          onChange={e => !readOnly && onChange(mod.module_id, col.key, e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                      ) : (
                        <span className="text-slate-300 text-[10px] select-none">—</span>
                      )}
                    </td>
                  );
                })}
                {!readOnly && (
                  <td className="border border-slate-200 text-center px-2 py-2.5">
                    <input type="checkbox" checked={allChecked}
                      ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                      onChange={e => availKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const SETUP_COLUMNS = [
    { key: "can_view",        label: "View"   },
    { key: "can_add",         label: "Create" },
    { key: "can_edit",        label: "Edit"   },
    { key: "can_delete",      label: "Delete" },
    { key: "can_trash",       label: "Trash"  },
    { key: "can_bulk_upload", label: "Bulk"   },
    { key: "can_export",      label: "Export" },
    { key: "can_log",         label: "Log"    },
  ];

  const SETUP_ROW_ORDER = [
    { group: "Vendor", keys: ["vendor_list", "vendor_pool"] },
    { group: "Item",   keys: ["item_supply", "item_sitc"]   },
    "uom",
    "category_list",
    "term_condition",
    "payment_terms",
    "government_laws",
    "annexure",
  ];

  const SETUP_TOTAL_COLS = SETUP_COLUMNS.length + (readOnly ? 0 : 1);

  const renderSetupTable = (groupMods) => {
    const byKey = Object.fromEntries(groupMods.map(m => [m.module_key, m]));
    const rows = [];
    let sno = 0;

    const renderModRow = (mod, indented = false) => {
      const availKeys = getModulePerms(mod.module_key);
      const allChecked = availKeys.every(k => mod[k]);
      const anyChecked = availKeys.some(k => mod[k]);
      sno++;
      return (
        <tr key={mod.module_id}
          className={`transition-colors ${anyChecked ? "bg-blue-50/40" : "bg-white"} hover:bg-blue-50/50`}>
          <td className="border border-slate-200 px-3 py-2.5 text-center text-[12px] font-semibold text-slate-500 tabular-nums">{sno}</td>
          <td className="border border-slate-200 px-3 py-2.5">
            <span className={`text-[12px] font-semibold text-slate-700 ${indented ? "pl-3" : ""}`}>
              {indented ? "↳ " : ""}{mod.module_name}
            </span>
          </td>
          {SETUP_COLUMNS.map(col => {
            const applicable = availKeys.includes(col.key);
            return (
              <td key={col.key} className="border border-slate-200 text-center px-2 py-2.5">
                {applicable ? (
                  <input type="checkbox" checked={mod[col.key] || false} disabled={readOnly}
                    onChange={e => !readOnly && onChange(mod.module_id, col.key, e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                ) : (
                  <span className="text-slate-300 text-[10px] select-none">—</span>
                )}
              </td>
            );
          })}
          {!readOnly && (
            <td className="border border-slate-200 text-center px-2 py-2.5">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                onChange={e => availKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
            </td>
          )}
        </tr>
      );
    };

    SETUP_ROW_ORDER.forEach(entry => {
      if (typeof entry === "string") {
        const mod = byKey[entry];
        if (mod) rows.push(renderModRow(mod, false));
      } else {
        const groupMods = entry.keys.map(k => byKey[k]).filter(Boolean);
        if (groupMods.length === 0) return;
        rows.push(
          <tr key={`grp-${entry.group}`} className="bg-slate-100">
            <td className="border border-slate-200 px-3 py-1.5" />
            <td className="border border-slate-200 px-3 py-1.5" colSpan={SETUP_TOTAL_COLS + 1}>
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{entry.group}</span>
            </td>
          </tr>
        );
        groupMods.forEach(mod => rows.push(renderModRow(mod, true)));
      }
    });

    return (
      <div className="rounded-sm border border-slate-300 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 text-center text-[11px] font-bold text-slate-900 w-10">S.No</th>
              <th className="border border-slate-300 px-3 py-2 text-left text-[11px] font-bold text-slate-900 w-44">Module</th>
              {SETUP_COLUMNS.map(col => (
                <th key={col.key} className="border border-slate-300 px-2 py-2 text-center text-[11px] font-bold text-slate-900 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {!readOnly && <th className="border border-slate-300 px-2 py-2 text-[11px] font-bold text-slate-900 text-center">All</th>}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  };

  const ORG_COLUMNS = [
    { key: "can_view",        label: "View"        },
    { key: "can_add",         label: "Add"         },
    { key: "can_edit",        label: "Edit"        },
    { key: "can_delete",      label: "Delete"      },
    { key: "can_bulk_upload", label: "Bulk Upload" },
    { key: "can_export",      label: "Export"      },
    { key: "can_log",         label: "Log"         },
  ];

  const ORG_ROW_ORDER = [
    { group: "Organisation", keys: ["company_list", "structure", "org_chart", "sop", "policy"] },
    { group: "Master Data",  keys: ["divisions", "departments", "teams", "grades", "designations"] },
    { group: "People",       keys: ["employees"] },
    { group: "Settings",     keys: ["locations"] },
  ];

  const ORG_TOTAL_COLS = ORG_COLUMNS.length + (readOnly ? 0 : 1);

  const renderOrganisationTable = (groupMods) => {
    const byKey = Object.fromEntries(groupMods.map(m => [m.module_key, m]));

    const renderModRow = (mod) => {
      const availKeys = getModulePerms(mod.module_key);
      const allChecked = availKeys.every(k => mod[k]);
      const anyChecked = availKeys.some(k => mod[k]);
      return (
        <tr key={mod.module_id}
          className={`transition-colors ${anyChecked ? "bg-blue-50/40" : "bg-white"} hover:bg-blue-50/50`}>
          <td className="border border-slate-200 px-3 py-2.5">
            <span className="text-[12px] font-semibold text-slate-700">{mod.module_name}</span>
          </td>
          {ORG_COLUMNS.map(col => {
            const applicable = availKeys.includes(col.key);
            return (
              <td key={col.key} className="border border-slate-200 text-center px-2 py-2.5">
                {applicable ? (
                  <input type="checkbox" checked={mod[col.key] || false} disabled={readOnly}
                    onChange={e => !readOnly && onChange(mod.module_id, col.key, e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                ) : (
                  <span className="text-slate-300 text-[10px] select-none">—</span>
                )}
              </td>
            );
          })}
          {!readOnly && (
            <td className="border border-slate-200 text-center px-2 py-2.5">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                onChange={e => availKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
            </td>
          )}
        </tr>
      );
    };

    const rows = [];
    ORG_ROW_ORDER.forEach(entry => {
      const groupMods2 = entry.keys.map(k => byKey[k]).filter(Boolean);
      if (groupMods2.length === 0) return;
      rows.push(
        <tr key={`org-grp-${entry.group}`} className="bg-slate-100">
          <td className="border border-slate-200 px-3 py-1.5" colSpan={ORG_TOTAL_COLS + 1}>
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{entry.group}</span>
          </td>
        </tr>
      );
      groupMods2.forEach(mod => rows.push(renderModRow(mod)));
    });

    return (
      <div className="rounded-sm border border-slate-300 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 text-left text-[11px] font-bold text-slate-900 w-44">Module</th>
              {ORG_COLUMNS.map(col => (
                <th key={col.key} className="border border-slate-300 px-2 py-2 text-center text-[11px] font-bold text-slate-900 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {!readOnly && <th className="border border-slate-300 px-2 py-2 text-[11px] font-bold text-slate-900 text-center">All</th>}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  };

  const ORDER_PERM_GROUPS = [
    { label: "Basic",    keys: ["can_view", "can_add", "can_edit", "can_delete"] },
    { label: "Request",  keys: ["can_request_recall", "can_request_amend", "can_request_cancel"] },
    { label: "Withdraw", keys: ["can_withdraw_recall", "can_withdraw_amend", "can_withdraw_cancel", "can_withdraw_submission"] },
    { label: "Utility",  keys: ["can_export", "can_download_document", "can_bulk_upload"] },
  ];

  const renderOrderCard = (mod) => {
    const availKeys = getModulePerms(mod.module_key);
    const allChecked = availKeys.every(k => mod[k]);
    const anyChecked = availKeys.some(k => mod[k]);
    return (
      <div key={mod.module_id} className="rounded-sm border border-slate-300 overflow-hidden">
        <div className="px-3 py-2.5 bg-white border-b border-slate-300">
          <p className="text-[13px] font-bold text-slate-800">Order</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 text-left text-[11px] font-bold text-slate-900 w-28">Group</th>
              <th className="border border-slate-300 px-3 py-2 text-left text-[11px] font-bold text-slate-900">Permissions</th>
              {!readOnly && (
                <th className="border border-slate-300 px-3 py-2 text-center text-[11px] font-bold text-slate-900 w-16">
                  <label className="flex items-center justify-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={allChecked}
                      ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                      onChange={e => availKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
                  </label>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {ORDER_PERM_GROUPS.map(grp => {
              const grpKeys = grp.keys.filter(k => availKeys.includes(k));
              if (!grpKeys.length) return null;
              const grpAllChecked = grpKeys.every(k => mod[k]);
              const grpAnyChecked = grpKeys.some(k => mod[k]);
              return (
                <tr key={grp.label} className={`transition-colors ${grpAnyChecked ? "bg-blue-50/40" : "bg-white"} hover:bg-blue-50/30`}>
                  <td className="border border-slate-200 px-3 py-2.5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{grp.label}</span>
                  </td>
                  <td className="border border-slate-200 px-3 py-2">
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                      {grpKeys.map(key => (
                        <label key={key}
                          className={`flex items-center gap-1.5 select-none ${readOnly ? "cursor-default opacity-90" : "cursor-pointer"}`}>
                          <input type="checkbox" checked={mod[key] || false} disabled={readOnly}
                            onChange={e => !readOnly && onChange(mod.module_id, key, e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                          <span className={`text-[11px] font-semibold ${PERM_COLOR[key] || "text-slate-500"}`}>
                            {PERM_LABELS[key]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="border border-slate-200 text-center px-2 py-2.5">
                      <input type="checkbox" checked={grpAllChecked}
                        ref={el => { if (el) el.indeterminate = grpAnyChecked && !grpAllChecked; }}
                        onChange={e => grpKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                        className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSimpleCard = (groupMods, title, permKeys) => {
    const mod = groupMods[0];
    if (!mod) return null;
    const availKeys = permKeys.filter(p => getModulePerms(mod.module_key).includes(p.key));
    const anyChecked = availKeys.some(p => mod[p.key]);
    return (
      <div className={`rounded-sm border p-3.5 transition-all ${anyChecked ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
        <p className="text-[13px] font-bold text-slate-800 mb-3 pb-2.5 border-b border-slate-100">{title}</p>
        <div className="flex flex-col gap-2">
          {availKeys.map(({ key, label }) => (
            <label key={key} className={`flex items-center gap-2 select-none ${readOnly ? "cursor-default opacity-90" : "cursor-pointer"}`}>
              <input type="checkbox" checked={mod[key] || false} disabled={readOnly}
                onChange={e => !readOnly && onChange(mod.module_id, key, e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
              <span className={`text-[11px] font-semibold ${PERM_COLOR[key] || "text-slate-500"}`}>{label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const renderHistoricalDataCard = (groupMods) => renderSimpleCard(groupMods, "Historical Data", [
    { key: "can_view",   label: "View"   },
    { key: "can_edit",   label: "Edit"   },
    { key: "can_delete", label: "Delete" },
  ]);

  const renderCombinedViewCard = (group, groupMods) => {
    const anyViewed = groupMods.some(m => m.can_view);
    const allViewed = groupMods.every(m => m.can_view);
    return (
      <div className={`rounded-sm border p-3.5 transition-all ${anyViewed ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
          <p className="text-[13px] font-bold text-slate-800">{group.label}</p>
        </div>
        <label className={`flex items-center gap-2 select-none ${readOnly ? "cursor-default opacity-90" : "cursor-pointer"}`}>
          <input type="checkbox" checked={allViewed} disabled={readOnly}
            onChange={e => groupMods.forEach(m => !readOnly && onChange(m.module_id, "can_view", e.target.checked))}
            className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
          <span className="text-[11px] font-semibold text-slate-600">View</span>
        </label>
      </div>
    );
  };

  const renderProjectAccess = () => {
    if (!allProjects.length) return null;
    const allSelected = allProjects.every(p => selectedProjects.includes(p.id));
    return (
      <div className="w-full space-y-2 mb-2">
        <div className="inline-flex items-center gap-4 px-4 py-2 bg-slate-200 border border-slate-300 rounded-sm">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-slate-500 rounded-full" />
            <span className="text-[12px] font-bold text-slate-800 tracking-wide">Project Access</span>
          </div>
          {!readOnly && (
            <button type="button" onClick={() => onProjectChange?.(allSelected ? [] : allProjects.map(p => p.id))}
              className="text-[11px] font-semibold px-3 py-1 rounded-full transition-all outline-none focus:outline-none bg-slate-700 text-white hover:bg-slate-800">
              {allSelected ? "Unselect All" : "Select All"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 pl-2">
          {allProjects.map(p => {
            const checked = selectedProjects.includes(p.id);
            return (
              <label key={p.id}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-sm border select-none transition
                  ${checked ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"}
                  ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
                <input type="checkbox" checked={checked} disabled={readOnly}
                  onChange={() => !readOnly && onProjectChange?.(
                    checked ? selectedProjects.filter(id => id !== p.id) : [...selectedProjects, p.id]
                  )}
                  className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-700 truncate">{p.projectName}</p>
                  {p.projectCode && <p className="text-[10px] text-slate-400">{p.projectCode}</p>}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const renderInboxGroup = (groupMods) => {
    const intake  = groupMods.find(m => m.module_key === "inbox_intakes");
    const orders  = groupMods.find(m => m.module_key === "inbox_orders");
    const payment = groupMods.find(m => m.module_key === "inbox_payments");

    const permChk = (mod, key) => {
      if (!mod) return null;
      const checked = !!mod[key];
      return (
        <label className={`flex items-center gap-1.5 select-none ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
          <input type="checkbox" checked={checked} disabled={readOnly}
            onChange={(e) => !readOnly && onChange(mod.module_id, key, e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
          <span className="text-[11px] text-slate-500 font-medium">
            {key === "can_view" ? "View" : "Action"}
          </span>
        </label>
      );
    };

    const ORDER_ROWS = [
      { label: "Issued" },
      { label: "Amendment" },
      { label: "Recall" },
      { label: "Cancel" },
    ];

    const allInboxChecked =
      !!intake?.can_view && !!orders?.can_view && !!orders?.can_take_action && !!payment?.can_view;

    return (
      <div className="w-full rounded-sm border border-slate-300 bg-slate-50 p-3.5">

        {/* Header — same as Global Dashboard */}
        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-400">
          <p className="text-[13px] font-bold text-slate-800">Inbox</p>
          {!readOnly && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-sm hover:bg-slate-100/70 transition">
              <input type="checkbox" checked={allInboxChecked}
                onChange={(e) => {
                  if (intake)  onChange(intake.module_id,  "can_view",       e.target.checked);
                  if (orders)  onChange(orders.module_id,  "can_view",       e.target.checked);
                  if (orders)  onChange(orders.module_id,  "can_take_action", e.target.checked);
                  if (payment) onChange(payment.module_id, "can_view",       e.target.checked);
                }}
                className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
            </label>
          )}
        </div>

        {/* Order */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Order</p>
          <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
            {ORDER_ROWS.map((row, i) => (
              <div key={row.label}
                className={`flex items-center justify-between px-3 py-2 ${i < ORDER_ROWS.length - 1 ? "border-b border-slate-100" : ""}`}>
                <p className="text-[12px] font-semibold text-slate-700 w-24">{row.label}</p>
                <div className="flex items-center gap-4">
                  {permChk(orders, "can_view")}
                  {permChk(orders, "can_take_action")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Intake + Payment — same row, each with heading + box */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Intake</p>
            <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
              {permChk(intake, "can_view")}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Payment</p>
            <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
              {permChk(payment, "can_view")}
            </div>
          </div>
        </div>

      </div>
    );
  };

  return (
    <div className="space-y-5">
      {MODULE_SECTIONS.map(({ section, groups }) => {
        const sectionHasMods = groups.some(g => modules.some(m => g.keys.includes(m.module_key)));
        if (!sectionHasMods) return null;
        return (
          <div key={section}>
            {(() => {
              const specialGroups = ["Global Dashboard", "Inbox"];
              const specialKeys = groups.filter(g => specialGroups.includes(g.label)).flatMap(g => g.keys);
              const hasSpecial = specialKeys.length > 0 && groups.some(g => specialGroups.includes(g.label));
              const specialMods = modules.filter(m => specialKeys.includes(m.module_key));
              const allSpecialChecked = specialMods.length > 0 && specialMods.every(m => getModulePermKeysFull(m).every(k => m[k]));
              return (
                <div className="flex items-center justify-between gap-3 mb-3 px-4 py-3 bg-slate-100 border border-slate-200 rounded-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1 h-5 bg-indigo-500 rounded-full" />
                    <span className="text-[13px] font-bold text-slate-700 tracking-wide">{section}</span>
                  </div>
                  {!readOnly && hasSpecial && (
                    <button type="button" onClick={() => toggleAllSection(specialKeys, !allSpecialChecked)}
                      className={`h-7 px-3 rounded-sm text-[11px] font-bold transition-colors shrink-0
                        ${allSpecialChecked
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-white border border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                        }`}>
                      {allSpecialChecked ? "Unselect All" : "Select All"}
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="flex flex-wrap gap-4 pl-2 items-start">
              {section === "Project Permissions" && renderProjectAccess()}
              {section === "Project Permissions" && selectedProjects.length === 0 && (
                <div className="w-full flex items-center gap-2.5 px-4 py-3 rounded-sm bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-semibold">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  Select at least one project to configure project permissions
                </div>
              )}
              {(() => {
                const isProjectLocked = section === "Project Permissions" && selectedProjects.length === 0;
                const firstCombinedIdx = groups.findIndex(g => g.combined_view);
                const content = groups.flatMap((group, gi) => {
                const groupMods = modules.filter(m => group.keys.includes(m.module_key));
                if (groupMods.length === 0) return [];
                const isCombined = !!group.combined_view;
                const otherHeading = (section === "Project Permissions" && gi === firstCombinedIdx && firstCombinedIdx !== -1) ? (
                  <div key="other-heading" className="w-full mt-1 mb-1">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 border border-slate-300 rounded-sm">
                      <div className="w-0.5 h-4 bg-slate-500 rounded-full" />
                      <span className="text-[12px] font-bold text-slate-800 tracking-wide">Other</span>
                    </div>
                  </div>
                ) : null;
                const allInGroupChecked = isCombined
                  ? groupMods.every(m => m.can_view)
                  : groupMods.every(m => getModulePermKeysFull(m).every(k => m[k]));
                const isSpecialCard = group.label === "Global Dashboard" || group.label === "Inbox";
                const isSingle = !!group.single;
                const groupEl = (
                  <div key={group.label} className={`space-y-2 ${isSpecialCard ? "max-w-xl w-full" : isSingle ? "flex-1 min-w-[280px] max-w-sm" : isCombined ? "w-auto" : "w-full"}`}>
                    {!isSpecialCard && !isCombined && (
                      <div className="inline-flex items-center gap-5 px-4 py-2 bg-slate-200 border border-slate-300 rounded-sm min-w-[220px]">
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-0.5 h-4 bg-slate-500 rounded-full" />
                          <span className="text-[12px] font-bold text-slate-800 tracking-wide">{group.label}</span>
                        </div>
                        {!readOnly && (
                          <button type="button" onClick={() => toggleAllSection(group.keys, !allInGroupChecked)}
                            className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-all shrink-0 outline-none focus:outline-none
                              ${allInGroupChecked
                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                : "bg-slate-700 text-white hover:bg-slate-800"
                              }`}>
                            {allInGroupChecked ? "Unselect All" : "Select All"}
                          </button>
                        )}
                      </div>
                    )}
                    {group.label === "Inbox" ? renderInboxGroup(groupMods)
                      : group.label === "Setup" ? renderSetupTable(groupMods)
                      : group.label === "Historical Data" ? renderHistoricalDataCard(groupMods)
                      : group.label === "Organisation" ? renderOrganisationTable(groupMods)
                      : group.label === "Audit" ? renderSimpleCard(groupMods, "Audit", [{ key: "can_view", label: "View" }])
                      : group.label === "Master Data" ? renderMasterDataTable(groupMods)
                      : group.label === "Procurement" ? (() => {
                          const order  = groupMods.find(m => m.module_key === "order");
                          const intake = groupMods.find(m => m.module_key === "intake");
                          return (
                            <div className="w-full space-y-3">
                              {order  && <div className="w-full">{renderRow(order)}</div>}
                              {intake && <div className="max-w-[220px]">{renderRow(intake)}</div>}
                            </div>
                          );
                        })()
                      : isCombined ? renderCombinedViewCard(group, groupMods)
                      : (
                      <div className={isSpecialCard ? "" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"}>
                        {groupMods.map(renderRow)}
                      </div>
                    )}
                  </div>
                );
                return [otherHeading, groupEl].filter(Boolean);
                });
                return isProjectLocked
                  ? <div key="locked" className="w-full opacity-40 pointer-events-none select-none">{content}</div>
                  : content;
              })()}
            </div>
          </div>
        );
      })}

    </div>
  );
}
