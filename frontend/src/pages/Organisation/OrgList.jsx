import React, { useState, useEffect } from "react";
import { Plus, MapPin } from "lucide-react";
import CompanyList from "../Procurement/CompanyList";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

const avatarColor = (name = "") => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const initials = (name = "") =>
  name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/* ── Logo Modal ───────────────────────────────────────── */
function LogoModal({ company, name, onClose }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 cursor-zoom-out" onClick={onClose}>
      {company.logoUrl ? (
        <div className="bg-white rounded p-6 shadow-2xl cursor-default w-72 h-72 flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <img src={company.logoUrl} alt={name} className="w-full h-full object-contain" />
        </div>
      ) : (
        <div className={`w-48 h-48 rounded flex items-center justify-center text-5xl font-black shadow-2xl cursor-default ${avatarColor(name)}`} onClick={e => e.stopPropagation()}>
          {initials(name)}
        </div>
      )}
    </div>
  );
}

/* ── Single Org Card ──────────────────────────────────── */
function OrgCard({ company, onOpen }) {
  const [showLogo, setShowLogo] = useState(false);
  const name    = company.companyName || company.company_name || "";
  const code    = company.companyCode || company.company_code || "";
  const gstin   = company.gstin    || "";
  const district = (company.district || "").trim();
  const state   = (company.state    || "").trim();
  const pincode = (company.pincode  || "").trim();
  const status  = (company.status   || "active").toLowerCase();

  const locationParts = [district, state].filter(Boolean).join(", ");
  const location = locationParts ? (pincode ? `${locationParts} — ${pincode}` : locationParts) : "";

  return (
    <div className="bg-white rounded border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Header */}
      {showLogo && <LogoModal company={company} name={name} onClose={() => setShowLogo(false)} />}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          onClick={() => setShowLogo(true)}
          className="shrink-0 cursor-pointer rounded ring-2 ring-transparent hover:ring-blue-400 transition-all">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="" className="w-11 h-11 rounded object-contain border border-slate-100 bg-slate-50 p-1" />
          ) : (
            <div className={`w-11 h-11 rounded flex items-center justify-center text-sm font-black ${avatarColor(name)}`}>
              {initials(name)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-slate-900 leading-snug truncate">{name}</p>
          <p className="text-[11px] font-semibold text-blue-600 mt-0.5">{code}</p>
        </div>
      </div>

      <div className="border-t border-slate-100" />

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {[
          { label: "Divisions",  val: company._divCount  ?? 0 },
          { label: "Depts",      val: company._deptCount ?? 0 },
          { label: "Employees",  val: company._empCount  ?? 0 },
        ].map(s => (
          <div key={s.label} className="text-center py-3">
            <p className="text-[17px] font-bold text-slate-800 leading-none">{s.val}</p>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100" />

      {/* Location + GSTIN */}
      <div className="px-4 py-3 space-y-2">
        {location ? (
          <div className="flex items-start gap-1.5">
            <MapPin size={12} className="shrink-0 text-slate-400 mt-0.5" />
            <p className="text-[12px] font-medium text-slate-600 leading-tight">{location}</p>
          </div>
        ) : null}
        {gstin ? (
          <p className="text-[12px]">
            <span className="text-slate-400 font-medium">GSTIN:  </span>
            <span className="text-slate-800 font-bold">{gstin}</span>
          </p>
        ) : (
          <p className="text-[12px] text-slate-400 italic">No GSTIN</p>
        )}
      </div>

      <div className="border-t border-slate-100" />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${status === "active" ? "text-emerald-600" : "text-slate-400"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
          {status === "active" ? "Active" : "Inactive"}
        </span>
        <button
          onClick={() => onOpen(company)}
          className="flex items-center gap-1 px-4 py-1.5 bg-slate-900 text-white text-[12px] font-semibold rounded hover:bg-blue-600 transition-colors">
          Open →
        </button>
      </div>
    </div>
  );
}

/* ── Add Card ─────────────────────────────────────────── */
function AddCard({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 min-h-[180px] hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
      <div className="w-10 h-10 rounded border-2 border-dashed border-slate-300 group-hover:border-blue-400 flex items-center justify-center">
        <Plus size={18} className="text-slate-400 group-hover:text-blue-500" />
      </div>
      <p className="text-sm font-semibold text-slate-400 group-hover:text-blue-500">Add Organisation</p>
    </button>
  );
}

/* ── Main OrgList ─────────────────────────────────────── */
export default function OrgList({ onSelectOrg, showAdd, onAddDone }) {
  const [companies,   setCompanies]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAddFlow, setShowAddFlow] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/companies`);
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch { setCompanies([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCompanies(); }, []);

  useEffect(() => {
    if (showAdd) setShowAddFlow(true);
  }, [showAdd]);

  const closeAdd = () => {
    setShowAddFlow(false);
    onAddDone?.();
  };

  const handleDataChange = () => {
    closeAdd();
    fetchCompanies();
  };

  return (
    <>
      {/* Cards grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading organisations…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {companies.map(c => (
            <OrgCard key={c.id} company={c} onOpen={onSelectOrg} />
          ))}
          <AddCard onClick={() => setShowAddFlow(true)} />
        </div>
      )}

      {showAddFlow && (
        <div className="fixed inset-0 z-[90]">
          <CompanyList
            formOnlyMode
            autoOpenAdd
            onDataChange={handleDataChange}
            onModalClose={closeAdd}
          />
        </div>
      )}
    </>
  );
}
