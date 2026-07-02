import React, { useState, useEffect } from "react";
import { Building2, Users, MapPin, Briefcase, ArrowRight, Layers, Network } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { cx, initials } from "./helpers";
import { DEPT_CHART_DATA, RECENT_HIRES, LEAVES_TODAY } from "./data";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

export default function Overview({ onNavigate }) {
  const [depts,     setDepts]     = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [subdepts,  setSubdepts]  = useState([]);

  useEffect(() => {
    const h = { Authorization: `Bearer ${TOKEN()}` };
    fetch(`${API}/api/departments`, { headers: h }).then(r => r.json()).then(j => setDepts(j.departments || [])).catch(() => {});
    fetch(`${API}/api/organisation/divisions`, { headers: h }).then(r => r.json()).then(j => setDivisions(j.divisions || [])).catch(() => {});
    fetch(`${API}/api/sub-departments`, { headers: h }).then(r => r.json()).then(j => setSubdepts(j.sub_departments || j.subDepartments || [])).catch(() => {});
  }, []);

  const activeDepts = depts.filter(d => d.status === "active").length;
  const activeDivs  = divisions.filter(d => d.status === "active").length;
  const activeSubs  = subdepts.filter(s => s.status === "active").length;

  const ORG_STATS = [
    {
      label: "Divisions",        totalLabel: "Total Divisions",      total: divisions.length, active: activeDivs,
      icon: Layers,    iconBg: "bg-purple-100", iconColor: "text-purple-600",
      linkLabel: "View all divisions",      linkTab: "divisions",
    },
    {
      label: "Departments",      totalLabel: "Total Departments",    total: depts.length,     active: activeDepts,
      icon: Building2, iconBg: "bg-violet-100", iconColor: "text-violet-600",
      linkLabel: "View all departments",    linkTab: "departments",
    },
    {
      label: "Sub-Departments",  totalLabel: "Total Sub-Departments", total: subdepts.length,  active: activeSubs,
      icon: Network,   iconBg: "bg-blue-100",   iconColor: "text-blue-600",
      linkLabel: "View all sub-departments", linkTab: "sub_departments",
    },
    {
      label: "Designations",     totalLabel: "Total Designations",   total: 0,  active: 0,
      icon: Briefcase, iconBg: "bg-amber-100",  iconColor: "text-amber-600",
      linkLabel: "View all designations",   linkTab: "designations",
    },
    {
      label: "Locations",        totalLabel: "Total Locations",      total: 0,  active: 0,
      icon: MapPin,    iconBg: "bg-rose-100",   iconColor: "text-rose-600",
      linkLabel: "View all locations",      linkTab: "locations",
    },
  ];

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Left: Organization Structure card */}
      <div className="col-span-12 lg:col-span-3">
        <div className="bg-white rounded border border-slate-200 overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-[15px] font-bold text-slate-800">Organization Structure</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage your organization hierarchy</p>
          </div>
          <div className="divide-y divide-slate-100">
            {ORG_STATS.map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className={cx("w-10 h-10 rounded flex items-center justify-center shrink-0", s.iconBg)}>
                      <Icon size={17} className={s.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 leading-tight">{s.label}</p>
                      <div className="flex items-end gap-6 mt-1.5">
                        <div>
                          <p className="text-[10px] text-slate-400 leading-none">{s.totalLabel}</p>
                          <p className="text-2xl font-black text-slate-800 leading-none mt-0.5">{s.total}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 leading-none">Active</p>
                          <p className="text-lg font-bold text-emerald-600 leading-none mt-0.5">{s.active}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => onNavigate?.(s.linkTab)}
                        className="mt-2 text-xs text-blue-600 font-medium flex items-center gap-0.5 hover:underline">
                        {s.linkLabel} <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right panels */}
      <div className="col-span-12 lg:col-span-9 flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-4">
          {/* Employees by Department */}
          <div className="bg-white rounded border border-slate-200 p-4">
            <p className="text-[13px] font-bold text-slate-800 mb-2">Employees by Department</p>
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={DEPT_CHART_DATA} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" paddingAngle={2}>
                    {DEPT_CHART_DATA.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} employees`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 mt-1">
              {DEPT_CHART_DATA.map(d => (
                <div key={d.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-600">{d.name}</span>
                  </div>
                  <span className="font-semibold text-slate-500">{d.pct}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Hires */}
          <div className="bg-white rounded border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-bold text-slate-800">Recent Hires</p>
              <button className="text-[11px] text-blue-600 font-semibold hover:underline">View all</button>
            </div>
            <div className="space-y-4">
              {RECENT_HIRES.map(h => (
                <div key={h.name} className="flex items-center gap-3">
                  <div className={cx("w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0", h.color)}>
                    {initials(h.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-800 leading-tight">{h.name}</p>
                    <p className="text-[11px] text-slate-500">{h.role}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-600">{h.dept}</p>
                    <p className="text-[10px] text-slate-400">{h.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Leaves Today */}
          <div className="bg-white rounded border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-bold text-slate-800">Leaves Today</p>
              <button className="text-[11px] text-blue-600 font-semibold hover:underline">View all</button>
            </div>
            <div className="space-y-4">
              {LEAVES_TODAY.map(l => (
                <div key={l.name} className="flex items-center gap-3">
                  <div className={cx("w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0", l.color)}>
                    {initials(l.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-800 leading-tight">{l.name}</p>
                    <p className="text-[11px] text-slate-500">{l.role}</p>
                  </div>
                  <span className={cx("px-2 py-0.5 rounded text-[10px] font-semibold shrink-0", l.typeCls)}>
                    {l.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
