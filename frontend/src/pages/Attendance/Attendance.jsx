import React, { useEffect, useMemo, useState } from "react";
import { Building2, FolderKanban, Briefcase, ClipboardCheck, CalendarRange, History, Loader2 } from "lucide-react";
import API from "../../api";
import ScopeDropdown from "../../components/ScopeDropdown";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import DailyRegister from "./DailyRegister";
import Records from "./Records";
import MonthlySheet from "./MonthlySheet";
import { isoToday } from "./utils";

/*
 * Attendance — for one project or office of a company.
 * Header like Petty Cash: Company ▾ · Project | Office · place ▾.
 * People come from HRMS Employees (posted at the place); rows are saved
 * against the place's code (routes/attendance.js).
 */
const KINDS = [
  { id: "project", label: "Project", plural: "projects", icon: FolderKanban },
  { id: "office",  label: "Office",  plural: "offices",  icon: Briefcase },
];
const TABS = [
  { id: "register", label: "Daily Register", icon: ClipboardCheck },
  { id: "monthly",  label: "Monthly Sheet",  icon: CalendarRange },
  { id: "records",  label: "Records",        icon: History },
];
const STORE = "attendance_scope";
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };

export default function Attendance() {
  const { canView } = useModulePermissions("staff_attendance");
  const [tab, setTab] = useState("register");
  const [data, setData] = useState(null); // { companies, places }
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState(() => readStore().companyId || "");
  const [kind, setKind] = useState(() => readStore().kind === "office" ? "office" : "project");
  const [placeCode, setPlaceCode] = useState(() => readStore().placeCode || "");
  const [date, setDate] = useState(isoToday); // register day; Records can open a day

  useEffect(() => {
    API.get("/api/attendance/places")
      .then(({ data }) => setData(data))
      .catch(err => setError(err?.response?.data?.error || "Could not load projects"));
  }, []);

  const companies = data?.companies || [];
  const company = companies.find(c => c.id === companyId) || companies[0] || null;
  const inCompany = useMemo(() => (data?.places || []).filter(p => p.companyId === company?.id), [data, company?.id]);
  // a company with only offices (or only projects) opens on what it has
  const hasKind = (k) => inCompany.some(p => p.kind === k);
  const kindNow = hasKind(kind) || !inCompany.length ? kind : (kind === "project" ? "office" : "project");
  const places = inCompany.filter(p => p.kind === kindNow);
  const place = places.find(p => p.code === placeCode) || places[0] || null;
  const K = KINDS.find(k => k.id === kindNow);

  useEffect(() => {
    if (company) localStorage.setItem(STORE, JSON.stringify({ companyId: company.id, kind: kindNow, placeCode: place?.code || "" }));
  }, [company, kindNow, place]);

  if (!canView) return (
    <div className="flex min-h-full items-center justify-center p-10">
      <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#f8fafc]">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {!data && !error && <Loader2 size={16} className="animate-spin text-slate-400" />}
          {data && company && (
            <>
              <ScopeDropdown subtle icon={Building2} value={company.id} placeholder="Select company" countLabel="Total Companies"
                onChange={id => { setCompanyId(id); setPlaceCode(""); }}
                options={companies.map(c => ({ id: c.id, title: c.name, code: c.code }))} />
              <span className="h-5 w-px bg-slate-200 shrink-0" />
              <div className="flex items-center bg-slate-100 rounded-md p-0.5 shrink-0">
                {KINDS.map(k => (
                  <button key={k.id} type="button" disabled={!hasKind(k.id)} onClick={() => { setKind(k.id); setPlaceCode(""); }}
                    title={hasKind(k.id) ? "" : `No ${k.plural} you can open in this company`}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                      ${kindNow === k.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {k.label}
                  </button>
                ))}
              </div>
              <ScopeDropdown subtle icon={K.icon} value={place?.code || ""} placeholder={`Select ${K.label.toLowerCase()}`}
                countLabel={`Total ${K.plural}`} onChange={setPlaceCode}
                options={places.map(p => ({ id: p.code, title: p.name, code: p.code, detail: p.detail }))} />
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : !data ? null : !place ? (
          <div className="h-full flex items-center justify-center p-10">
            <p className="text-slate-400 font-bold uppercase tracking-wider text-sm text-center">
              {companies.length ? `No ${K.plural} in your Attendance access for this company` : "You don't have any project or office in your Attendance access"}
            </p>
          </div>
        ) : tab === "register" ? (
          <DailyRegister key={place.code} place={place} date={date} onDateChange={setDate} />
        ) : tab === "monthly" ? (
          <MonthlySheet key={place.code} place={place} onOpenDay={d => { setDate(d); setTab("register"); }} />
        ) : (
          <Records key={place.code} place={place} />
        )}
      </div>
    </div>
  );
}
