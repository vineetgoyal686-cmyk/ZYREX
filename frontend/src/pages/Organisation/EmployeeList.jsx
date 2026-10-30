import React, { useState, useEffect, useRef } from "react";
import {
  Search, Plus, X, Edit2, Trash2, Loader2, ChevronLeft,
  BadgeCheck, Calendar, UserCheck, MapPin,
  Briefcase, Building2, ChevronDown, Users, Clock, SlidersHorizontal, ArrowRightLeft, Check,
} from "lucide-react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { gradeCls, descriptionsLabel } from "./Grades";
import { authFetch } from "../../utils/authFetch";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { ContactLogModal } from "../Create/FullMasterModals";
import { useOrgId, scopedUrl } from "./orgScope";
import BrandLoader from "../../components/BrandLoader";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";
const PER_PAGE = 20;

const EMPLOYEE_LOG_FIELDS = [
  { key: "personName",    label: "Name" },
  { key: "employeeId",    label: "Employee ID" },
  { key: "company",       label: "Company" },
  { key: "division",      label: "Division" },
  { key: "department",    label: "Department" },
  { key: "designation",   label: "Designation" },
  { key: "grade",         label: "Grade" },
  { key: "team",          label: "Team" },
  { key: "role",          label: "Role" },
  { key: "reportingTo",   label: "Reporting Manager" },
  { key: "workLocation",  label: "Work Location" },
  { key: "contactNumber", label: "Contact Number" },
  { key: "alternatePhone", label: "Alternate Phone" },
  { key: "email",         label: "Email" },
  { key: "status",        label: "Status" },
  { key: "staffType",     label: "Staff Type" },
  { key: "gender",        label: "Gender" },
  { key: "maritalStatus", label: "Marital Status" },
  { key: "nationality",   label: "Nationality" },
  { key: "address",       label: "Address" },
  { key: "joiningDate",   label: "Joining Date" },
  { key: "dateOfBirth",   label: "Date of Birth" },
];

/* ── Status config ── */
const STATUS = {
  active:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  inactive: { label: "Inactive", cls: "bg-red-50 text-red-500 border border-red-200",             dot: "bg-red-400",    bar: "bg-red-400"     },
  on_leave: { label: "On Leave", cls: "bg-amber-50 text-amber-700 border border-amber-200",        dot: "bg-amber-400",  bar: "bg-amber-400"   },
};

/* ── Staff Type ── */
const STAFF_TYPES = ["Permanent", "Probation", "Temporary", "Support", "Resigned"];
const STAFF_TYPE_CLS = {
  Permanent: "bg-blue-50 text-blue-700 border-blue-200",
  Probation: "bg-amber-50 text-amber-700 border-amber-200",
  Temporary: "bg-orange-50 text-orange-700 border-orange-200",
  Support:   "bg-slate-100 text-slate-600 border-slate-200",
  Resigned:  "bg-red-50 text-red-500 border-red-200",
};
// "permanent", "Resigned " etc. from a sheet → the exact option, or "" if it isn't one
// What a person does — separate from Staff Type (Permanent / Probation …)
const CATEGORIES = ["Office Staff", "Site Staff", "Guard", "Driver", "Cook"];
// these get the short form: no division / grade / personal details
const SHORT_FORM = ["Guard", "Driver", "Cook"];
const CATEGORY_CLS = {
  "Office Staff": "bg-blue-50 text-blue-700 border-blue-200",
  "Site Staff":   "bg-teal-50 text-teal-700 border-teal-200",
  "Guard":        "bg-slate-100 text-slate-700 border-slate-300",
  "Driver":       "bg-violet-50 text-violet-700 border-violet-200",
  "Cook":         "bg-rose-50 text-rose-700 border-rose-200",
};
const toCategory = (v) => CATEGORIES.find(c => c.toLowerCase() === String(v || "").trim().toLowerCase()) || "";
function CategoryBadge({ category }) {
  if (!category) return <span className="text-slate-300">—</span>;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CATEGORY_CLS[category]}`}>{category}</span>;
}
const digits = (v) => String(v || "").replace(/\D/g, "");

// "B47 · IAS House" for the place an employee is posted at; opts from
// /api/organisation/employee-options
const postedLabel = (emp, opts) => {
  if (!emp.postedId) return emp.workLocation || "";
  const p = (emp.postedKind === "office" ? opts.offices : opts.projects).find(x => x.id === emp.postedId);
  return p ? [p.code, p.name].filter(Boolean).join(" · ") : "";
};
const agencyName = (emp, opts) =>
  emp.employedThrough === "agency" ? (opts.agencies.find(a => a.id === emp.agencyVendorId)?.name || "Agency") : "Direct";

const toStaffType = (v) => STAFF_TYPES.find(t => t.toLowerCase() === String(v || "").trim().toLowerCase()) || "";
function StaffTypeBadge({ type }) {
  if (!type) return <span className="text-slate-300">—</span>;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STAFF_TYPE_CLS[type] || STAFF_TYPE_CLS.Support}`}>{type}</span>;
}

/* ── Avatar palette ── */
const PALETTE = [
  ["#4f46e5","#818cf8"], ["#0ea5e9","#38bdf8"], ["#10b981","#34d399"],
  ["#f59e0b","#fbbf24"], ["#ef4444","#f87171"], ["#8b5cf6","#a78bfa"],
  ["#ec4899","#f472b6"], ["#06b6d4","#22d3ee"], ["#84cc16","#a3e635"],
];
const avatarGrad = (name) => {
  const [f, t] = PALETTE[(name?.charCodeAt(0) || 65) % PALETTE.length];
  return { background: `linear-gradient(135deg, ${f}, ${t})`, color: "#fff" };
};
const ini = (n) => (n || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

/* ── Tiny components ── */
function Avatar({ name, size = "md", imgUrl }) {
  const sz = { xl: "w-[72px] h-[72px] text-2xl", lg: "w-14 h-14 text-lg", md: "w-10 h-10 text-sm", sm: "w-8 h-8 text-xs" }[size];
  if (imgUrl) return <div className={`${sz} rounded-full overflow-hidden shrink-0`}><img src={imgUrl} alt={name} className="w-full h-full object-cover" /></div>;
  return <div className={`${sz} rounded-full flex items-center justify-center shrink-0 font-bold`} style={avatarGrad(name)}>{ini(name)}</div>;
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
    </span>
  );
}

function GradeBadge({ grade }) {
  if (!grade) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black ${gradeCls(grade)}`}>
      {grade}
    </span>
  );
}

function InfoBox({ label, value, span2 }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 ${span2 ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[13px] font-semibold break-words ${value ? "text-slate-800" : "text-slate-300 italic"}`}>{value || "—"}</p>
    </div>
  );
}

/* ═══════════════════════════════
   DETAIL VIEW
═══════════════════════════════ */
const DETAIL_TABS = ["Overview", "Documents", "Notes", "Permissions"];

function EmployeeDetail({ emp, imgUrl, opts, onBack, onEdit, onMove, onDelete }) {
  const [tab, setTab] = useState("Overview");
  const s   = STATUS[emp.status || "active"];
  const div = emp.division || "";
  const grd = emp.grade || "";

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Back + actions */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors">
          <ChevronLeft size={15} /> Back to Employees
        </button>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              <Edit2 size={13} /> Edit
            </button>
          )}
          {onMove && (
            <button onClick={onMove}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              <ArrowRightLeft size={13} /> Move
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete}
              className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Status stripe */}
      <div className={`h-1 ${s.bar} shrink-0`} />

      {/* Hero */}
      <div className="px-8 py-5 bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-5">
          <Avatar name={emp.personName} size="xl" imgUrl={imgUrl} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-0.5">
              <h2 className="text-xl font-bold text-slate-800">{emp.personName}</h2>
              <StatusBadge status={emp.status} />
              {emp.category && <CategoryBadge category={emp.category} />}
              {emp.staffType && <StaffTypeBadge type={emp.staffType} />}
            </div>
            <p className="text-sm text-slate-500 font-medium">{emp.designation || "—"}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {emp.department && <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Briefcase size={10} />{emp.department}</span>}
              {div && <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Building2 size={10} />{div}</span>}
              {emp.contactCode && <code className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono font-bold">{emp.contactCode}</code>}
            </div>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="px-8 py-4 bg-white border-b border-slate-100 shrink-0">
        <div className="grid grid-cols-4 divide-x divide-slate-100">
          {[
            { Icon: BadgeCheck, label: "Employee ID",       value: emp.employeeId },
            { Icon: Calendar,   label: "Joining Date",      value: emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "" },
            { Icon: UserCheck,  label: "Reporting Manager", value: emp.reportingTo },
            { Icon: MapPin,     label: "Posted At",         value: postedLabel(emp, opts) },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-5 first:pl-0 last:pr-0">
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">{label}</p>
                <p className={`text-sm font-semibold truncate ${value ? "text-slate-700" : "text-slate-300"}`}>{value || "—"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 bg-white border-b border-slate-100 shrink-0">
        <div className="flex">
          {DETAIL_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6">
        {tab === "Overview" ? (
          <div className="grid grid-cols-3 gap-4">

            {/* Personal Info */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-indigo-500" />
                <h3 className="text-[13px] font-bold text-slate-800">Personal Info</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <InfoBox label="Full Name" value={emp.personName} span2 />
                <InfoBox label="Date of Birth" value={emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""} />
                <InfoBox label="Gender" value={emp.gender} />
                <InfoBox label="Marital Status" value={emp.maritalStatus} />
                <InfoBox label="Nationality" value={emp.nationality} />
              </div>
            </div>

            {/* Contact Info */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-sky-500" />
                <h3 className="text-[13px] font-bold text-slate-800">Contact Info</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <InfoBox label="Email" value={emp.email} span2 />
                <InfoBox label="Mobile" value={emp.contactNumber} />
                <InfoBox label="Employed Through" value={agencyName(emp, opts)} />
                <InfoBox label="Phone (Alternate)" value={emp.alternatePhone} />
                <InfoBox label="Address" value={emp.address || "No address added"} span2 />
              </div>
            </div>

            {/* Organisation Info — hierarchy chain */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-violet-500" />
                <h3 className="text-[13px] font-bold text-slate-800">Organisation Info</h3>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: "Division",    value: div,            Icon: Building2 },
                  { label: "Department",  value: emp.department, Icon: Briefcase },
                  { label: "Team",        value: emp.team,       Icon: Users     },
                  { label: "Designation", value: emp.designation, Icon: BadgeCheck },
                ].map((item, idx, arr) => (
                  <React.Fragment key={item.label}>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                      <p className={`mt-0.5 text-[13px] font-semibold ${item.value ? "text-slate-800" : "text-slate-300 italic"}`}>{item.value || "—"}</p>
                    </div>
                    {idx < arr.length - 1 && <div className="text-center text-slate-300 text-xs leading-none">↓</div>}
                  </React.Fragment>
                ))}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Grade</span>
                  <GradeBadge grade={grd} />
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-slate-300 text-sm italic">{tab} — coming soon</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════
   ADD / EDIT MODAL
═══════════════════════════════ */
const SEL = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white appearance-none";
const INP = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const LBL = "block text-xs font-semibold text-slate-500 mb-1";

function EmpModal({ form, setForm, editId, saving, onClose, onSave, divisions, allEmps, opts }) {
  const orgId = useOrgId();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const [gradeList, setGradeList] = useState([]);
  const [desigList, setDesigList] = useState([]);
  useEffect(() => {
    fetch(scopedUrl(`${API}/api/organisation/grades`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setGradeList(
        (d.grades || []).map(g => ({ ...g, gradeId: g.grade_id || g.gradeId, order: g.sort_order ?? g.order ?? 1 }))
          .filter(g => g.status === "active").sort((a, b) => (a.order || 0) - (b.order || 0))
      )).catch(() => {});
    fetch(scopedUrl(`${API}/api/organisation/org-designations`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setDesigList(
        (d.designations || []).map(x => ({ ...x, desigId: x.desig_id || x.desigId, active: x.status === "active" }))
      )).catch(() => {});
  }, []);

  /* auto-fill grade when designation is typed/picked */
  const handleDesigChange = (e) => {
    const title = e.target.value;
    const match = desigList.find(d => d.title.toLowerCase() === title.toLowerCase().trim());
    setForm(f => ({ ...f, designation: title, grade: match?.grade ?? f.grade }));
  };

  /* reporting manager grade warning (A < B < C ascending) */
  const managerEmp       = allEmps.find(e => e.personName?.toLowerCase() === form.reportingTo?.toLowerCase().trim() && e.personName);
  const empGradeCode     = form.grade?.charCodeAt(0) || 0;
  const managerGradeCode = managerEmp?.grade?.charCodeAt(0) || 0;
  const managerGradeWarn = form.reportingTo?.trim() && managerEmp && managerGradeCode > 0 && managerGradeCode > 0 && managerGradeCode < empGradeCode;
  const short = SHORT_FORM.includes(form.category);
  const places = form.postedKind === "office" ? opts.offices : opts.projects;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-[15px] font-bold text-slate-800">{editId ? "Edit Employee" : "Add Employee"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Identity */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Identity</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className={LBL}>Full Name *</label>
                <input value={form.personName} onChange={set("personName")} placeholder="e.g. Rahul Sharma" className={INP} />
              </div>
              <div>
                <label className={LBL}>Category</label>
                <select value={form.category} onChange={set("category")} className={SEL}>
                  <option value="">— Select —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Mobile *</label>
                <input value={form.contactNumber} onChange={set("contactNumber")} placeholder="9876543210" inputMode="numeric" className={INP} />
              </div>
              <div>
                <label className={LBL}>Employee ID</label>
                <input value={form.employeeId} onChange={set("employeeId")} placeholder="If the company gave one" className={INP} />
              </div>
              <div>
                <label className={LBL}>Status</label>
                <select value={form.status} onChange={set("status")} className={SEL}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                </select>
              </div>
              <div>
                <label className={LBL}>Staff Type</label>
                <select value={form.staffType} onChange={set("staffType")} className={SEL}>
                  <option value="">— Select —</option>
                  {STAFF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Joining Date</label>
                <input type="date" value={form.joiningDate} onChange={set("joiningDate")} className={INP} />
              </div>
            </div>
          </div>

          {/* Posting & employment */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Posting</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LBL}>Posted At</label>
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {[["project", "Project"], ["office", "Office"]].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setForm(f => ({ ...f, postedKind: k, postedId: "" }))}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${form.postedKind === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className={LBL}>{form.postedKind === "office" ? "Office" : "Project"}</label>
                <select value={form.postedId} onChange={set("postedId")} className={SEL}>
                  <option value="">— Not posted —</option>
                  {places.map(p => <option key={p.id} value={p.id}>{[p.code, p.name].filter(Boolean).join(" · ")}</option>)}
                </select>
                {places.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">This company has no {form.postedKind === "office" ? "offices" : "projects"} yet.</p>
                )}
              </div>
              <div>
                <label className={LBL}>Employed Through</label>
                <select value={form.employedThrough} onChange={e => setForm(f => ({ ...f, employedThrough: e.target.value, agencyVendorId: "" }))} className={SEL}>
                  <option value="direct">Direct (company payroll)</option>
                  <option value="agency">Agency</option>
                </select>
              </div>
              {form.employedThrough === "agency" && (
                <div className="col-span-2">
                  <label className={LBL}>Agency</label>
                  <select value={form.agencyVendorId} onChange={set("agencyVendorId")} className={SEL}>
                    <option value="">— Select agency —</option>
                    {opts.agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">Agencies come from the Vendor list.</p>
                </div>
              )}
            </div>
          </div>

          {short ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Work</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className={LBL}>Designation</label>
                <input value={form.designation} onChange={handleDesigChange}
                  placeholder={form.category === "Guard" ? "e.g. Security Guard" : "e.g. Helper"} className={INP} list="desig-suggestions" />
                <datalist id="desig-suggestions">
                  {desigList.map(d => <option key={d.id} value={d.title} />)}
                </datalist>
              </div>
              <div>
                <label className={LBL}>Phone (Alternate)</label>
                <input value={form.alternatePhone} onChange={set("alternatePhone")} placeholder="Optional" className={INP} />
              </div>
              <div className="col-span-3">
                <label className={LBL}>Address</label>
                <textarea value={form.address} onChange={set("address")} rows={2} placeholder="Residential address…" className={`${INP} resize-none`} />
              </div>
            </div>
          </div>
          ) : (<>
          {/* Organisation */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Organisation</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LBL}>Division</label>
                <select value={form.division} onChange={set("division")} className={SEL}>
                  <option value="">— Select Division —</option>
                  {divisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Department</label>
                <input value={form.department} onChange={set("department")} placeholder="e.g. Technical" className={INP} />
              </div>
              <div>
                <label className={LBL}>Team</label>
                <input value={form.team} onChange={set("team")} placeholder="e.g. Site Team A" className={INP} />
              </div>
              <div className="col-span-2">
                <label className={LBL}>Designation</label>
                <input
                  value={form.designation} onChange={handleDesigChange}
                  placeholder="e.g. Site Engineer" className={INP}
                  list="desig-suggestions"
                />
                <datalist id="desig-suggestions">
                  {desigList.map(d => <option key={d.id} value={d.title} />)}
                </datalist>
              </div>
              <div>
                <label className={LBL}>Grade</label>
                <div className="flex items-center gap-2">
                  {gradeList.length > 0 ? (
                    <select value={form.grade} onChange={set("grade")} className={`${SEL} flex-1`}>
                      <option value="">— Select Grade —</option>
                      {gradeList.map(g => <option key={g.id} value={g.grade}>{g.grade}{descriptionsLabel(g) ? ` — ${descriptionsLabel(g)}` : ""}</option>)}
                    </select>
                  ) : (
                    <input value={form.grade} onChange={set("grade")} placeholder="A" maxLength={1} className={`${INP} w-20 uppercase`} />
                  )}
                  {form.grade && (
                    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-black shrink-0 ${gradeCls(form.grade)}`}>
                      {form.grade}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className={LBL}>Reporting Manager</label>
                <input
                  value={form.reportingTo} onChange={set("reportingTo")}
                  placeholder="Manager name" className={INP}
                  list="mgr-suggestions"
                />
                <datalist id="mgr-suggestions">
                  {allEmps.filter(e => e.personName && e.id !== editId).map(e => (
                    <option key={e.id} value={e.personName} />
                  ))}
                </datalist>
                {managerGradeWarn && (
                  <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                    Selected manager (Grade {managerEmp.grade}) has a lower grade than this employee (Grade {form.grade})
                  </p>
                )}
              </div>
              <div>
                <label className={LBL}>Role</label>
                <input value={form.role} onChange={set("role")} placeholder="e.g. Site Engineer" className={INP} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Contact</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LBL}>Phone (Alternate)</label>
                <input value={form.alternatePhone} onChange={set("alternatePhone")} placeholder="Optional" className={INP} />
              </div>
              <div className="col-span-2">
                <label className={LBL}>Work Email</label>
                <input type="email" value={form.email} onChange={set("email")} placeholder="If the company gave one" className={INP} />
              </div>
              <div className="col-span-3">
                <label className={LBL}>Address</label>
                <textarea value={form.address} onChange={set("address")} rows={2} placeholder="Residential address…" className={`${INP} resize-none`} />
              </div>
            </div>
          </div>

          {/* Personal */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Personal</p>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={LBL}>Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} className={INP} />
              </div>
              <div>
                <label className={LBL}>Gender</label>
                <select value={form.gender} onChange={set("gender")} className={SEL}>
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className={LBL}>Marital Status</label>
                <select value={form.maritalStatus} onChange={set("maritalStatus")} className={SEL}>
                  <option value="">— Select —</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                </select>
              </div>
              <div>
                <label className={LBL}>Nationality</label>
                <input value={form.nationality} onChange={set("nationality")} placeholder="e.g. Indian" className={INP} />
              </div>
            </div>
          </div>
          </>)}

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {editId ? "Save Changes" : "Add Employee"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════
   EMPTY FORM
═══════════════════════════════ */
const EMPTY_FORM = {
  personName: "", employeeId: "", status: "active", staffType: "",
  division: "", department: "", designation: "", grade: "", team: "", role: "",
  reportingTo: "", workLocation: "", joiningDate: "", dateOfBirth: "",
  gender: "", maritalStatus: "", nationality: "",
  contactNumber: "", alternatePhone: "", email: "", address: "",
  company: "", bio: "", tags: "",
  category: "", postedKind: "project", postedId: "", employedThrough: "direct", agencyVendorId: "",
};

/* ═══════════════════════════════
   MAIN COMPONENT
═══════════════════════════════ */
/* ── "Filters" button — Division / Department / Status in one popover ── */
const STATUS_OPTIONS = [["active", "Active"], ["inactive", "Inactive"], ["on_leave", "On Leave"]];

/* ── Category picker in the header — same size as the Filters button ── */
const CATEGORY_DOT = {
  "Office Staff": "bg-blue-500", "Site Staff": "bg-teal-500", "Guard": "bg-slate-500",
  "Driver": "bg-violet-500", "Cook": "bg-rose-500",
};

function CategoryPicker({ value, emps, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const label = (c) => c === "Guard" ? "Guards" : c;
  const rows = [
    { id: "", label: "All categories", n: emps.length },
    ...CATEGORIES.map(c => ({ id: c, label: label(c), n: emps.filter(e => e.category === c).length, dot: CATEGORY_DOT[c] })),
  ];
  const cur = rows.find(r => r.id === value) || rows[0];

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-[7px] text-xs font-medium rounded-md border transition-colors
          ${value ? "border-blue-200 bg-blue-50 text-blue-700" : open ? "border-slate-300 bg-slate-50 text-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        {cur.dot ? <span className={`w-2 h-2 rounded-full ${cur.dot}`} /> : <Users size={13} />}
        {cur.label}
        <span className={`min-w-4 h-4 px-1 rounded text-[10px] font-bold flex items-center justify-center tabular-nums
          ${value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{cur.n}</span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-1">
          {rows.map((r, i) => {
            const on = r.id === value;
            return (
              <React.Fragment key={r.id || "all"}>
                {i === 1 && <div className="my-1 border-t border-slate-100" />}
                <button type="button" onClick={() => { onChange(r.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-[13px] transition-colors
                    ${on ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  {r.dot ? <span className={`w-2 h-2 rounded-full shrink-0 ${r.dot}`} /> : <Users size={13} className="text-slate-400 shrink-0" />}
                  <span className={`flex-1 ${!r.n && !on ? "text-slate-400" : ""}`}>{r.label}</span>
                  <span className={`text-[11px] tabular-nums ${on ? "text-blue-600" : "text-slate-400"}`}>{r.n}</span>
                  <Check size={13} className={`shrink-0 ${on ? "text-blue-600" : "invisible"}`} />
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmpFilters({ filters, divs, depts, onChange, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const active = Object.values(filters).filter(Boolean).length;
  const field = (label, key, options) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className="relative">
        <select value={filters[key]} onChange={e => onChange(key, e.target.value)}
          className="w-full pl-2.5 pr-7 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer">
          <option value="">All</option>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </label>
  );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-[7px] text-xs font-medium rounded-md border transition-colors
          ${active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        <SlidersHorizontal size={13} /> Filters
        {active > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{active}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-3 flex flex-col gap-2.5">
          {field("Division", "div", divs.map(d => [d, d]))}
          {field("Department", "dept", depts.map(d => [d, d]))}
          {field("Status", "status", STATUS_OPTIONS)}
          {field("Staff Type", "type", STAFF_TYPES.map(t => [t, t]))}
          {active > 0 && (
            <button onClick={onClear} className="self-end text-[11px] font-semibold text-slate-500 hover:text-slate-800">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════
   MOVE TO ANOTHER COMPANY
   Same employee (same id) — orders, attendance and history go along.
═══════════════════════════════ */
/* company list for the move window — initials, name and code on each row */
function CompanyPicker({ companies, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const cur = companies.find(c => c.id === value);
  const Row = ({ c }) => (
    <>
      <span className="w-8 h-8 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0">
        {(c.companyCode || ini(c.companyName)).slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold text-slate-800 truncate">{c.companyName}</span>
        {c.companyCode && <span className="block text-[11px] text-slate-400">{c.companyCode}</span>}
      </span>
    </>
  );

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 rounded-lg border bg-white px-3 py-2 transition-colors
          ${open ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}>
        {cur ? <Row c={cur} /> : (
          <span className="flex-1 text-left text-sm text-slate-400 py-1.5">Choose company…</span>
        )}
        <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-10 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl p-1">
          {companies.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No other company</p>}
          {companies.map(c => (
            <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors
                ${c.id === value ? "bg-blue-50" : "hover:bg-slate-50"}`}>
              <Row c={c} />
              {c.id === value && <BadgeCheck size={16} className="text-blue-600 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MoveModal({ emps, fromId, onClose, onMoved }) {
  const [companies, setCompanies] = useState([]);
  const [to, setTo]           = useState("");
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState("");

  useEffect(() => {
    fetch(`${API}/api/procurement/companies`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(j => setCompanies((j.companies || []).filter(c => c.id !== fromId))).catch(() => {});
  }, [fromId]);

  const move = async () => {
    setBusy(true); setErr("");
    try {
      const res  = await authFetch(`${API}/api/organisation/employees/move`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: emps.map(e => e.id), company_id: to }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Move failed");
      setResult(data);
      onMoved(data);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const missing = Object.entries(result?.missing || {});
  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <ArrowRightLeft size={16} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Move to another company</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {emps.length === 1 ? emps[0].personName : `${emps.length} employees`}
            </p>
          </div>
        </div>

        {!result ? (
          <>
            <CompanyPicker companies={companies} value={to} onChange={setTo} />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Orders, attendance and history stay with the employee. They leave their teams in this company.
            </p>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={move} disabled={!to || busy}
                className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium flex items-center gap-1.5">
                {busy && <Loader2 size={13} className="animate-spin" />} Move
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              {result.moved.length} moved to <span className="font-semibold">{result.company}</span>.
            </p>
            {result.skipped?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-1">Not moved</p>
                {result.skipped.map((x, i) => <p key={i}>{x.name} — {x.reason}</p>)}
              </div>
            )}
            {missing.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">Not in {result.company}&apos;s lists yet — add them there:</p>
                {missing.map(([label, names]) => <p key={label}><span className="text-slate-400">{label}:</span> {names.join(", ")}</p>)}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors font-medium">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function EmployeeList({ actionsRef, view = "card", onViewChange, onCountChange, toolbarSlot }) {
  const { canEdit, canDelete } = useModulePermissions("employees");
  const orgId = useOrgId();
  const [emps,    setEmps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState("");
  const [filterDiv,    setFilterDiv]    = useState("");
  const [filterDept,   setFilterDept]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [category,     setCategory]     = useState(""); // tab above the list; "" = all
  const [opts, setOpts] = useState({ projects: [], offices: [], agencies: [] });
  const [modal,      setModal]     = useState(false);
  const [form,       setForm]      = useState(EMPTY_FORM);
  const [editId,     setEditId]    = useState(null);
  const [saving,     setSaving]    = useState(false);
  const [page,       setPage]      = useState(1);
  const [perPage,    setPerPage]   = useState(20);
  const [logEmp,     setLogEmp]    = useState(null);
  const [imgUrls,    setImgUrls]   = useState({});
  const [selectedImgUrl, setSelectedImgUrl] = useState(null);
  const [toast,      setToast]     = useState(null);
  const [importing,  setImporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [picked,     setPicked]    = useState([]);
  const [moveEmps,   setMoveEmps]  = useState(null);
  const importRef = useRef(null);

  const [divisions, setDivisions] = useState([]);
  useEffect(() => {
    fetch(scopedUrl(`${API}/api/organisation/divisions`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setDivisions(d.divisions || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchEmps(); }, []);
  useEffect(() => {
    authFetch(scopedUrl(`${API}/api/organisation/employee-options`, orgId)).then(r => r.json())
      .then(d => setOpts({ projects: d.projects || [], offices: d.offices || [], agencies: d.agencies || [] }))
      .catch(() => {});
  }, [orgId]);

  /* wire actionsRef for parent header buttons */
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      openAdd:          openAdd,
      exportExcel:      exportExcel,
      exportPDF:        exportPDF,
      downloadTemplate: downloadTemplate,
      openUpload:       () => importRef.current?.click(),
    };
    return () => { actionsRef.current = {}; };
  });

  /* sign profile images in batch */
  useEffect(() => {
    const withImg = emps.filter(c => c.profileImage);
    if (!withImg.length) return;
    fetch(`${API}/api/procurement/sign-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "picture", paths: withImg.map(c => c.profileImage) }),
    }).then(r => r.json()).then(d => {
      const map = {};
      withImg.forEach(c => { const u = d.urls?.[c.profileImage]; if (u) map[c.id] = u; });
      setImgUrls(map);
    }).catch(() => {});
  }, [emps]);

  /* sign selected employee image */
  useEffect(() => {
    setSelectedImgUrl(null);
    if (!selected?.profileImage) return;
    fetch(`${API}/api/procurement/sign-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "picture", paths: [selected.profileImage] }),
    }).then(r => r.json()).then(d => {
      const url = d.urls?.[selected.profileImage];
      if (url) setSelectedImgUrl(url);
    }).catch(() => {});
  }, [selected?.id, selected?.profileImage]);

  const fetchEmps = async () => {
    setLoading(true);
    try {
      const res  = await authFetch(scopedUrl(`${API}/api/organisation/employees`, orgId));
      const data = await res.json();
      setEmps(data.contacts || []);
    } catch { setEmps([]); }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const openAdd  = () => { setForm({ ...EMPTY_FORM, category }); setEditId(null); setModal(true); };
  const openEdit = (emp) => {
    setForm({
      personName: emp.personName || "", employeeId: emp.employeeId || "",
      status: emp.status || "active",
      staffType: emp.staffType || "",
      division: emp.division || "",
      department: emp.department || "", designation: emp.designation || "",
      grade: emp.grade || "", team: emp.team || "", role: emp.role || "",
      reportingTo: emp.reportingTo || "", workLocation: emp.workLocation || "",
      joiningDate: emp.joiningDate || "", dateOfBirth: emp.dateOfBirth || "",
      gender: emp.gender || "", maritalStatus: emp.maritalStatus || "",
      nationality: emp.nationality || "", contactNumber: emp.contactNumber || "",
      alternatePhone: emp.alternatePhone || "", email: emp.email || "",
      address: emp.address || "", bio: emp.bio || "", tags: emp.tags || "",
      company: emp.company || "",
      category: emp.category || "", postedKind: emp.postedKind || "project", postedId: emp.postedId || "",
      employedThrough: emp.employedThrough || "direct", agencyVendorId: emp.agencyVendorId || "",
    });
    setEditId(emp.id);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.personName.trim()) { showToast("Name is required", "error"); return; }
    if (digits(form.contactNumber).length < 10) { showToast("A 10-digit mobile number is required", "error"); return; }
    if (form.employedThrough === "agency" && !form.agencyVendorId) { showToast("Pick the agency", "error"); return; }
    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, createdById: u.id || "", createdByName: u.name || "", company_id: orgId };
      const before = editId ? emps.find(e => e.id === editId) : null;
      const url    = editId ? `${API}/api/organisation/employees/${editId}` : `${API}/api/organisation/employees`;
      const method = editId ? "PUT" : "POST";
      const res    = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!data.success) throw new Error(data.error || data.message);
      const savedId = editId || data.id;

      // Audit trail — same log every contact edit lands in, regardless of
      // whether it happened here or from the Contact Person picker in orders.
      const changes = editId
        ? EMPLOYEE_LOG_FIELDS
            .filter(f => (before?.[f.key] || "") !== (form[f.key] || ""))
            .map(f => ({ field: f.label, from: before?.[f.key] || "", to: form[f.key] || "" }))
        : null;
      if (savedId && (!editId || changes.length > 0)) {
        fetch(`${API}/api/audit-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "contact",
            entityId: savedId,
            entityName: form.personName,
            action: editId ? "Updated" : "Created",
            userId: u.id || "",
            userName: u.name || "",
            userEmail: u.email || "",
            changes,
          }),
        }).catch(() => {});
      }

      if (editId) {
        const updated = { ...emps.find(e => e.id === editId), ...form };
        setEmps(prev => prev.map(e => e.id === editId ? updated : e));
        if (selected?.id === editId) setSelected(updated);
      } else {
        await fetchEmps();
      }
      showToast(editId ? "Employee updated" : "Employee added");
      setModal(false);
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = (id) => {
    const emp = emps.find(e => e.id === id);
    setDeleteConfirm({ id, name: emp?.personName || "this employee" });
  };

  const confirmDelete = async () => {
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await authFetch(`${API}/api/organisation/employees/${id}`, { method: "DELETE" });
      setEmps(prev => prev.filter(e => e.id !== id));
      if (selected?.id === id) setSelected(null);
      showToast("Employee deleted");
    } catch { showToast("Failed to delete", "error"); }
  };

  /* moved out of this company: drop them from the list, log the change */
  const handleMoved = ({ moved, company }) => {
    const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
    emps.filter(e => moved.includes(e.id)).forEach(e => {
      fetch(`${API}/api/audit-logs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "contact", entityId: e.id, entityName: e.personName, action: "Updated",
          userId: u.id || "", userName: u.name || "", userEmail: u.email || "",
          changes: [{ field: "Company", from: e.company || "", to: company }],
        }),
      }).catch(() => {});
    });
    setEmps(prev => prev.filter(e => !moved.includes(e.id)));
    setPicked(prev => prev.filter(id => !moved.includes(id)));
  };
  // leave the detail screen only once the result is closed — switching
  // screens while it is open would remount the window and lose the result
  const closeMove = () => {
    setMoveEmps(null);
    if (selected && !emps.some(e => e.id === selected.id)) setSelected(null);
  };
  const moveModal = moveEmps && (
    <MoveModal emps={moveEmps} fromId={orgId} onClose={closeMove} onMoved={handleMoved} />
  );

  /* ── Filter ── */
  const allDivs  = [...new Set(emps.map(e => e.division || "").filter(Boolean))].sort();
  const allDepts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort();

  const filtered = emps.filter(e => {
    const div = e.division || "";
    const q   = search.toLowerCase();
    return (
      (!search || [e.personName, e.employeeId, e.designation, e.department, div, e.contactNumber].some(v => v?.toLowerCase().includes(q))) &&
      (!filterDiv    || div === filterDiv) &&
      (!filterDept   || e.department === filterDept) &&
      (!filterStatus || e.status === filterStatus) &&
      (!filterType   || e.staffType === filterType) &&
      (!category     || e.category === category)
    );
  });

  // Guards / Drivers / Cooks have no division, department or grade —
  // their tabs show who they come through instead
  const workerTab = SHORT_FORM.includes(category);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { onCountChange?.(filtered.length); }, [filtered.length]);

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = filtered.map((e, i) => ({
      "#": i + 1, "Emp ID": e.employeeId, "Name": e.personName,
      "Division": e.division || "",
      "Department": e.department || "", "Designation": e.designation || "",
      "Grade": e.grade || "", "Status": STATUS[e.status]?.label || "Active", "Staff Type": e.staffType || "",
      "Category": e.category || "", "Posted At": postedLabel(e, opts), "Employed Through": agencyName(e, opts),
      "Mobile": e.contactNumber || "", "Email": e.email || "",
      "Reporting Manager": e.reportingTo || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [4, 14, 24, 18, 18, 24, 8, 12, 12, 14, 24, 20, 16, 28, 22].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employees.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Employees", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Emp ID", "Name", "Division", "Department", "Designation", "Grade", "Status", "Staff Type"]],
      body: filtered.map((e, i) => [
        i + 1, e.employeeId, e.personName, e.division || "—",
        e.department || "—", e.designation || "—", e.grade || "—",
        STATUS[e.status]?.label || "Active", e.staffType || "—",
      ]),
      styles: { fontSize: 8, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("employees.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const gradeHint = "as set in the Grades tab (A, B, C…)";
    const headers = ["Person Name", "Phone", "Employee ID", "Category", "Posted At", "Employed Through", "Agency", "Company", "Division", "Department", "Designation", "Grade", "Team", "Role", "Reporting Manager", "Joining Date", "Status", "Staff Type", "Email", "Gender", "Marital Status", "Nationality", "Address"];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ["Rahul Sharma", "9876543210", "BITL-001", "Site Staff", "B47", "Direct", "", "Bootes Impex Tech Pvt Ltd", "Engineering", "Civil", "Site Engineer", "C", "Site Team A", "Civil Engineer", "Ravi Kumar", "2024-01-01", "Active", "Permanent", "rahul@company.com", "Male", "Single", "Indian", "New Delhi"],
      ["Ramesh Singh", "9812345678", "", "Guard", "B47", "Agency", "SecureX Services", "", "", "", "Security Guard", "", "", "", "", "2025-06-01", "Active", "Temporary", "", "Male", "", "", ""],
      [],
      ["Phone is required; Employee ID and Email only if the company gave one", `Valid category: ${CATEGORIES.join(" / ")}`, "Posted At: project or office code", "Employed Through: Direct / Agency (Agency = vendor name)", `Valid grades: ${gradeHint}`, "Valid status: Active / Inactive / On Leave", `Valid staff type: ${STAFF_TYPES.join(" / ")}`],
    ]);
    ws["!cols"] = headers.map(h => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employees_template.xlsx");
  };

  /* ── Bulk Import ── */
  // "Posted At" is a project / office code, "Agency" a vendor name
  const placementFromRow = (r) => {
    const code = String(r["Posted At"] || "").trim().toLowerCase();
    const prj = code && opts.projects.find(p => p.code.toLowerCase() === code);
    const off = code && !prj && opts.offices.find(o => o.code.toLowerCase() === code);
    const agencyText = String(r["Agency"] || "").trim().toLowerCase();
    const agency = agencyText && opts.agencies.find(a => a.name.toLowerCase() === agencyText);
    return {
      postedKind: off ? "office" : "project", postedId: (prj || off)?.id || "",
      employedThrough: agency || String(r["Employed Through"] || "").toLowerCase().startsWith("agency") ? "agency" : "direct",
      agencyVendorId: agency?.id || "",
    };
  };
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const rawRows  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const u        = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const rows     = rawRows
        .map(r => ({
          personName:    String(r["Person Name"]        || r["name"]        || "").trim(),
          employeeId:    String(r["Employee ID"]        || r["employeeId"]  || "").trim(),
          division:      String(r["Division"]           || "").trim(),
          company:       String(r["Company"]            || "").trim(),
          department:    String(r["Department"]         || "").trim(),
          designation:   String(r["Designation"]        || "").trim(),
          grade:         String(r["Grade"]              || "").trim().toUpperCase().charAt(0),
          team:          String(r["Team"]               || "").trim(),
          role:          String(r["Role"]               || "").trim(),
          reportingTo:   String(r["Reporting Manager"]  || "").trim(),
          workLocation:  String(r["Work Location"]      || "").trim(),
          category:      toCategory(r["Category"]),
          ...placementFromRow(r),
          joiningDate:   String(r["Joining Date"]       || "").trim(),
          status:        String(r["Status"]             || "active").toLowerCase().includes("inactive") ? "inactive" : String(r["Status"] || "").toLowerCase().includes("leave") ? "on_leave" : "active",
          staffType:     toStaffType(r["Staff Type"]),
          contactNumber: String(r["Phone"] || r["Mobile"] || "").trim(),
          email:         String(r["Email"]              || "").trim(),
          gender:        String(r["Gender"]             || "").trim(),
          maritalStatus: String(r["Marital Status"]     || "").trim(),
          nationality:   String(r["Nationality"]        || "").trim(),
          address:       String(r["Address"]            || "").trim(),
          createdById:   u.id || "", createdByName: u.name || "Bulk Import",
        }))
        .filter(r => r.personName);

      if (!rows.length) { alert("No valid rows found. Make sure 'Person Name' column exists."); return; }

      let imported = 0;
      const failed = [];
      for (const row of rows) {
        const res = await authFetch(`${API}/api/organisation/employees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...row, company_id: orgId }),
        });
        if (res.ok) imported++;
        else failed.push(`${row.personName}: ${(await res.json().catch(() => ({}))).error || "failed"}`);
      }
      await fetchEmps();
      alert(`${imported} employee(s) imported.` + (failed.length ? `\n\n${failed.length} not imported:\n${failed.slice(0, 15).join("\n")}` : ""));
    } catch { alert("Failed to read file. Please use the template format."); }
    finally { setImporting(false); e.target.value = ""; }
  };

  /* ── Detail screen ── */
  if (selected) {
    return (
      <div className="flex-1 overflow-hidden -mt-5 -mx-6 -mb-4" style={{ height: "calc(100vh - 56px)" }}>
        <EmployeeDetail
          emp={selected}
          imgUrl={selectedImgUrl}
          opts={opts}
          onBack={() => setSelected(null)}
          onEdit={canEdit ? () => openEdit(selected) : undefined}
          onMove={canEdit ? () => setMoveEmps([selected]) : undefined}
          onDelete={canDelete ? () => handleDelete(selected.id) : undefined}
        />
        {modal && (
          <EmpModal form={form} setForm={setForm} editId={editId} saving={saving}
            onClose={() => setModal(false)} onSave={handleSave} divisions={divisions} allEmps={emps} opts={opts} />
        )}
        {moveModal}
        {toast && (
          <div className={`fixed top-5 right-5 z-[200] px-4 py-3 rounded-lg text-sm font-medium shadow-lg border
            ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
            {toast.msg}
          </div>
        )}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={16} className="text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Delete Employee</p>
                  <p className="text-xs text-slate-500 mt-0.5">"{deleteConfirm.name}" ko permanently delete kiya jaayega.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={confirmDelete}
                  className="px-4 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── List screen ── */
  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-lg px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <BrandLoader compact />
            <p className="text-slate-700 font-semibold text-sm">Importing employees…</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-5 right-5 z-[200] px-4 py-3 rounded-lg text-sm font-medium shadow-lg border
          ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <Trash2 size={16} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Delete Employee</p>
                <p className="text-xs text-slate-500 mt-0.5">"{deleteConfirm.name}" ko permanently delete kiya jaayega.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="px-4 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters — shown in the page header (toolbarSlot) */}
      {(() => {
        const bar = (
          <>
            <div className="relative w-40 sm:w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search employees…"
                className="pl-8 pr-3 py-[7px] text-xs border border-slate-200 rounded-md bg-slate-50 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white" />
            </div>
            <CategoryPicker value={category} emps={emps} onChange={c => { setCategory(c); setPage(1); }} />
            <EmpFilters
              filters={{ div: filterDiv, dept: filterDept, status: filterStatus, type: filterType }}
              divs={allDivs} depts={allDepts}
              onChange={(k, v) => {
                ({ div: setFilterDiv, dept: setFilterDept, status: setFilterStatus, type: setFilterType })[k](v);
                setPage(1);
              }}
              onClear={() => { setFilterDiv(""); setFilterDept(""); setFilterStatus(""); setFilterType(""); setPage(1); }} />
          </>
        );
        return toolbarSlot
          ? createPortal(bar, toolbarSlot)
          : <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">{bar}</div>;
      })()}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <BrandLoader />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-300">
          <Users size={32} />
          <p className="text-sm">{search || filterDiv || filterDept || filterStatus || filterType || category ? "No employees match your filters" : "No employees yet — add one above"}</p>
        </div>
      ) : view === "card" ? (

        /* ── CARD VIEW ── */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {paginated.map(emp => {
            const div = emp.division || "";
            return (
              <div key={emp.id} onClick={() => setSelected(emp)}
                className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all flex flex-col items-center text-center gap-2 group">
                <Avatar name={emp.personName} size="lg" imgUrl={imgUrls[emp.id]} />
                <div className="min-w-0 w-full">
                  <p className="font-bold text-[13px] text-slate-800 truncate group-hover:text-blue-700 transition-colors">{emp.personName}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{emp.designation || "—"}</p>
                </div>
                {div && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 truncate max-w-full">{div}</span>
                )}
                <div className="flex items-center justify-between w-full mt-1">
                  <GradeBadge grade={emp.grade} />
                  <StatusBadge status={emp.status} />
                </div>
              </div>
            );
          })}
        </div>

      ) : (

        /* ── TABLE VIEW ── */
        <div className="bg-white rounded-lg border border-slate-200 flex flex-col" style={{ height: "calc(100svh - 110px)" }}>
          {picked.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-blue-50/60 text-[12px]">
              <span className="font-semibold text-slate-700">{picked.length} selected</span>
              <button onClick={() => setMoveEmps(emps.filter(e => picked.includes(e.id)))}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">
                <ArrowRightLeft size={12} /> Move to company
              </button>
              <button onClick={() => setPicked([])} className="text-slate-500 hover:text-slate-800 font-semibold">Clear</button>
            </div>
          )}
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
              <thead className="sticky top-0 z-[20]">
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  {canEdit && (
                    <th style={{ width: 40, minWidth: 40, left: 0 }} className="px-3 py-3 bg-slate-50 border-b border-r border-slate-200 sticky z-[22]">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 cursor-pointer" title="Select this page"
                        checked={paginated.length > 0 && paginated.every(e => picked.includes(e.id))}
                        onChange={ev => {
                          const ids = paginated.map(e => e.id);
                          setPicked(prev => ev.target.checked ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id)));
                        }} />
                    </th>
                  )}
                  <th style={{ width: 110, minWidth: 110, left: canEdit ? 40 : 0 }} className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap sticky z-[22]">Contact ID</th>
                  <th style={{ minWidth: 180, left: canEdit ? 150 : 110 }} className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap sticky z-[22]">Name</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Emp ID</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Category</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Posted At</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Mobile</th>
                  {!workerTab && <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Division</th>}
                  {!workerTab && <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Department</th>}
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Designation</th>
                  {workerTab
                    ? <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Through</th>
                    : <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Grade</th>}
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Status</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Staff Type</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-l border-slate-200 whitespace-nowrap text-center sticky right-0 z-[22]">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((emp) => {
                  const div = emp.division || "";
                  const td = "px-4 py-3 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";
                  return (
                    <tr key={emp.id} className="group cursor-pointer" onClick={() => setSelected(emp)}>
                      {canEdit && (
                        <td style={{ width: 40, minWidth: 40, left: 0 }} onClick={e => e.stopPropagation()}
                          className="px-3 py-3 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50 transition-colors sticky z-[5]">
                          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                            checked={picked.includes(emp.id)}
                            onChange={() => setPicked(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id])} />
                        </td>
                      )}
                      <td style={{ width: 110, minWidth: 110, left: canEdit ? 40 : 0 }} className="px-4 py-3 border-b border-r border-slate-200 text-xs font-medium text-slate-500 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky z-[5]">{emp.contactCode || "—"}</td>
                      <td style={{ minWidth: 180, left: canEdit ? 150 : 110 }} className="px-4 py-3 border-b border-r border-slate-200 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky z-[5]">
                        <span className="font-semibold text-slate-800 text-[13px]">{emp.personName}</span>
                      </td>
                      <td className={`${td} text-xs font-medium`}>{emp.employeeId || "—"}</td>
                      <td className={`${td} text-center`}><CategoryBadge category={emp.category} /></td>
                      <td className={td}>
                        {emp.postedId ? postedLabel(emp, opts) || "—"
                          : emp.workLocation ? <span className="text-slate-400 italic" title="Old location text — pick a project or office in Edit">{emp.workLocation}</span>
                          : "—"}
                        {!workerTab && emp.employedThrough === "agency" && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">{agencyName(emp, opts)}</span>}
                      </td>
                      <td className={`${td} tabular-nums`}>{emp.contactNumber || "—"}</td>
                      {!workerTab && <td className={td}>{div || "—"}</td>}
                      {!workerTab && <td className={td}>{emp.department || "—"}</td>}
                      <td className={td}>{emp.designation || "—"}</td>
                      {workerTab
                        ? <td className={td}>{agencyName(emp, opts)}</td>
                        : <td className={`${td} text-center`}><GradeBadge grade={emp.grade} /></td>}
                      <td className={`${td} text-center`}><StatusBadge status={emp.status} /></td>
                      <td className={`${td} text-center`}><StaffTypeBadge type={emp.staffType} /></td>
                      <td className="px-4 py-3 border-b border-l border-slate-200 text-center whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky right-0 z-[5]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && <button onClick={() => openEdit(emp)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit"><Edit2 size={13} /></button>}
                          {canEdit && <button onClick={() => setMoveEmps([emp])} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Move to another company"><ArrowRightLeft size={13} /></button>}
                          <button onClick={() => setLogEmp(emp)} className="p-1.5 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Edit history"><Clock size={13} /></button>
                          {canDelete && <button onClick={() => handleDelete(emp.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination — always visible, outside scroll */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Rows per page:</span>
              <div className="relative">
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="appearance-none text-[11px] border border-slate-200 rounded pl-2 pr-5 py-1 text-slate-600 bg-white focus:outline-none">
                  {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <span className="text-[11px] text-slate-400">
                {filtered.length > 0 ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)} of ${filtered.length}` : "0 results"}
              </span>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors">Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const n = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button key={n} onClick={() => setPage(n)}
                      className={`w-7 h-7 text-xs rounded border transition-colors ${page === n ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors">Next</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card view pagination */}
      {view === "card" && totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-slate-400">Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-colors">Next</button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <EmpModal form={form} setForm={setForm} editId={editId} saving={saving}
          onClose={() => setModal(false)} onSave={handleSave} divisions={divisions} allEmps={emps} opts={opts} />
      )}
      {logEmp && <ContactLogModal contact={logEmp} onClose={() => setLogEmp(null)} />}
      {moveModal}
    </>
  );
}
