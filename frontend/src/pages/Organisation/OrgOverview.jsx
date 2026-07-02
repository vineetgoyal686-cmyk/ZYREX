import React, { useState, useEffect, useRef } from "react";
import { Edit2, Trash2, History, Image, MoreHorizontal } from "lucide-react";
import { cx } from "./helpers";
import LogPanel from "../../components/LogPanel";
import CompanyList from "../Procurement/CompanyList";
import { Star } from "lucide-react";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700",
];
const avatarColor = (name = "") => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const initials = (name = "") =>
  name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/* ── Field component ─────────────────────────── */
function Field({ label, value, full }) {
  return (
    <div className={full ? "col-span-full" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
      <p className="text-[13px] font-bold text-slate-800">{value || "—"}</p>
    </div>
  );
}

const TABS = ["Main Detail", "Billing Address", "Bank Detail", "State Billing", "Images"];

export default function OrgOverview({ org: initialOrg, onDeleted }) {
  const [org,       setOrg]       = useState(initialOrg);
  const [deptCount, setDeptCount] = useState(0);
  const [divCount,  setDivCount]  = useState(0);
  const [subCount,  setSubCount]  = useState(0);
  const [activeTab, setActiveTab] = useState("Main Detail");
  const [showLog,   setShowLog]   = useState(false);
  const [showEdit,  setShowEdit]  = useState(false);
  const [showMore,  setShowMore]  = useState(false);
  const moreRef = useRef(null);
  const clRef   = useRef({});

  useEffect(() => {
    const h = { Authorization: `Bearer ${TOKEN()}` };
    fetch(`${API}/api/departments`, { headers: h }).then(r => r.json()).then(j => setDeptCount((j.departments || []).length)).catch(() => {});
    fetch(`${API}/api/organisation/divisions`, { headers: h }).then(r => r.json()).then(j => setDivCount((j.divisions || []).length)).catch(() => {});
    fetch(`${API}/api/sub-departments`, { headers: h }).then(r => r.json()).then(j => setSubCount((j.sub_departments || j.subDepartments || []).length)).catch(() => {});
  }, []);

  useEffect(() => {
    const h = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const name   = org.companyName || org.company_name || "";
  const code   = org.companyCode || org.company_code || "";
  const status = (org.status || "active").toLowerCase();

  const locationLine = [
    code,
    [org.district?.trim(), org.state?.trim()].filter(Boolean).join(", "),
    org.pincode?.trim(),
  ].filter(Boolean).join(" · ").replace(/·\s*(\d)/, "— $1");

  const STATS = [
    { label: "Divisions",   val: divCount },
    { label: "Departments", val: deptCount },
    { label: "Sub-Depts",   val: subCount },
    { label: "Employees",   val: 0 },
  ];

  const handleDelete = async () => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await fetch(`${API}/api/procurement/companies/${org.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch { alert("Failed to delete"); }
  };

  const stateProfiles = (() => {
    try {
      const v = org.stateBillingProfiles;
      return Array.isArray(v) ? v : (typeof v === "string" ? JSON.parse(v || "[]") : []);
    } catch { return []; }
  })();

  const renderTab = () => {
    switch (activeTab) {
      case "Main Detail":
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5 p-5">
            <Field label="GSTIN"       value={org.gstin} />
            <Field label="PAN"         value={org.pan} />
            <Field label="Entity Code" value={code} />
            <Field label="State"       value={org.state} />
            <Field label="District"    value={org.district} />
            <Field label="Pincode"     value={org.pincode} />
            <Field label="Phone"       value={org.phone} />
            <Field label="Email"       value={org.email} />
            <Field label="Address"     value={org.address} full />
          </div>
        );

      case "Billing Address":
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5 p-5">
            <Field label="Billing GSTIN"  value={org.billingGstin} />
            <Field label="Contact Name"   value={org.billingContactName} />
            <Field label="Contact Phone"  value={org.billingContactPhone} />
            <Field label="Billing Address" value={org.billingAddress} full />
          </div>
        );

      case "Bank Detail":
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5 p-5">
            <Field label="Account No"      value={org.accountNo} />
            <Field label="Account Holder"  value={org.accountHolderName} />
            <Field label="IFSC Code"       value={org.ifscCode} />
            <Field label="Bank Name"       value={org.bankName} />
            <Field label="Branch"          value={org.bankBranch} />
            <Field label="Bank City"       value={org.bankCity} />
          </div>
        );

      case "State Billing":
        return stateProfiles.length === 0 ? (
          <p className="p-5 text-sm text-slate-400 text-center">No state profiles added.</p>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stateProfiles.flatMap(block =>
              (block.profiles || []).map((profile, i) => (
                <div key={profile.id || i} className="rounded border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-bold text-slate-800">{block.stateName}</p>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      Profile {i + 1}
                      {profile.isDefault && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600 font-semibold">
                          <Star size={10} fill="currentColor" /> Default
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <Field label="GSTIN"   value={profile.gstin} />
                    <Field label="Address" value={profile.address} full />
                  </div>
                </div>
              ))
            )}
          </div>
        );

      case "Images":
        return (
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Entity Logo",  url: org.logoUrl },
              { label: "Entity Stamp", url: org.stampUrl },
            ].map(({ label, url }) => (
              <div key={label} className="rounded border border-dashed border-slate-200 bg-slate-50 p-3">
                <div className="flex h-24 items-center justify-center">
                  {url
                    ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
                    : <Image size={22} className="text-slate-300" />}
                </div>
                <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        );

      default: return null;
    }
  };

  return (
    <>
      {showEdit && (
        <CompanyList
          formOnlyMode autoOpenEdit={org} actionsRef={clRef}
          onDataChange={() => {
            fetch(`${API}/api/procurement/companies`)
              .then(r => r.json())
              .then(j => { const f = (j.companies || []).find(c => c.id === org.id); if (f) setOrg(f); })
              .catch(() => {});
            setShowEdit(false);
          }}
          onModalClose={() => setShowEdit(false)}
        />
      )}
      {showLog && (
        <LogPanel entityType="company" entityId={org.id} entityName={name} onClose={() => setShowLog(false)} />
      )}

      <div className="w-full space-y-4">

        {/* Header card */}
        <div className="bg-white rounded border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            {/* Avatar + Info */}
            <div className="flex items-center gap-4">
              {org.logoUrl ? (
                <img src={org.logoUrl} alt="" className="w-14 h-14 rounded object-contain border border-slate-100 bg-slate-50 p-1.5 shrink-0" />
              ) : (
                <div className={cx("w-14 h-14 rounded flex items-center justify-center text-xl font-black shrink-0", avatarColor(name))}>
                  {initials(name)}
                </div>
              )}
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 leading-tight">{name}</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">{locationLine}</p>
                <span className={cx(
                  "inline-flex items-center gap-1 mt-1.5 text-[12px] font-semibold",
                  status === "active" ? "text-emerald-600" : "text-slate-400"
                )}>
                  <span className={cx("w-1.5 h-1.5 rounded-full", status === "active" ? "bg-emerald-500" : "bg-slate-300")} />
                  {status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setShowLog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors">
                <History size={13} /> Log
              </button>
              <button onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors">
                <Edit2 size={13} /> Edit
              </button>
              <button onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border border-red-200 rounded text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {STATS.map(s => (
              <div key={s.label} className="bg-slate-50 rounded px-3 py-3 text-center border border-slate-100">
                <p className="text-[22px] font-bold text-slate-800 leading-tight">{s.val}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabbed detail card */}
        <div className="bg-white rounded border border-slate-200">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 px-4 gap-0 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{scrollbarWidth:"none"}}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cx(
                  "px-4 py-3 text-[12px] font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px",
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                )}>
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {renderTab()}
        </div>

      </div>
    </>
  );
}
