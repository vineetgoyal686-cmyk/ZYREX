import React, { useState, useEffect, useRef } from "react";
import {
  Search, Plus, X, Edit2, Trash2, Loader2, ChevronLeft,
  BadgeCheck, Calendar, UserCheck, MapPin,
  Briefcase, Building2, ChevronDown, Users, Clock, SlidersHorizontal, ArrowRightLeft, Check,
  MoreHorizontal, ExternalLink, Mail, Phone, Copy, ChevronRight,
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

const EMPLOYEE_LOG_FIELDS = [
  { key: "personName",    label: "Name" },
  { key: "employeeId",    label: "Employee ID" },
  { key: "company",       label: "Company" },
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
// these get the short form: no department / grade / personal details
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
function Avatar({ name, size = "md", imgUrl, square }) {
  const sz = { "2xl": "w-28 h-28 text-4xl", xl: "w-[72px] h-[72px] text-2xl", lg: "w-14 h-14 text-lg", md: "w-10 h-10 text-sm", sm: "w-8 h-8 text-xs" }[size];
  const shape = square ? (size === "sm" ? "rounded-md" : size === "2xl" ? "rounded-2xl" : "rounded-xl") : "rounded-full";
  if (imgUrl) return <div className={`${sz} ${shape} overflow-hidden shrink-0`}><img src={imgUrl} alt={name} className="w-full h-full object-cover" /></div>;
  return <div className={`${sz} ${shape} flex items-center justify-center shrink-0 font-bold`} style={avatarGrad(name)}>{ini(name)}</div>;
}

/* Big avatar: ring on hover, click shows the photo full size (card + profile) */
function PhotoAvatar({ name, imgUrl, size = "xl", round }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const k = (e) => { if (e.key === "Escape") setZoom(false); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [zoom]);
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} title="View photo"
        className={`shrink-0 ${round ? "rounded-full" : "rounded-xl"} ring-0 ring-blue-200 hover:ring-4 transition-shadow`}>
        <Avatar name={name} size={size} imgUrl={imgUrl} square={!round} />
      </button>
      {zoom && (
        <div data-stop className="fixed inset-0 z-[100] bg-black/70 flex flex-col items-center justify-center gap-3 p-6" onClick={() => setZoom(false)}>
          <button type="button" onClick={() => setZoom(false)} title="Close" className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"><X size={20} /></button>
          {imgUrl
            ? <img src={imgUrl} alt={name} onClick={e => e.stopPropagation()} className="max-h-[80vh] max-w-[90vw] rounded-lg shadow-2xl object-contain bg-white" />
            : <div onClick={e => e.stopPropagation()} className="scale-[2.5] my-20"><Avatar name={name} size="xl" square /></div>}
          <p className="text-white text-sm font-semibold">{name}</p>
          {!imgUrl && <p className="text-white/60 text-xs -mt-2">No photo uploaded yet</p>}
        </div>
      )}
    </>
  );
}

/* Employee card (Keka-style) with a details popover behind "⋯" */
function EmpCard({ emp, imgUrl, place, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const [copied, setCopied] = useState(false);
  const copyEmail = () => {
    if (!emp.email) return;
    navigator.clipboard?.writeText(emp.email);
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  };
  const Field = ({ label, children }) => (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 text-[13px] font-medium text-slate-700 truncate">{children}</div>
    </div>
  );
  const Item = ({ label, value }) => (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-[13px] text-slate-800 whitespace-nowrap">{value || "—"}</p>
    </div>
  );
  return (
    <div ref={ref} onClick={e => { if (!e.target.closest("button, a, [data-stop]")) onOpen(); }}
      className="relative bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all">
      {/* photo · name · title · ⋯ */}
      <div className="flex items-center gap-3 pr-8">
        <PhotoAvatar name={emp.personName} imgUrl={imgUrl} size="lg" />
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="block max-w-full font-bold text-[14px] text-slate-800 truncate hover:text-blue-700 text-left">{emp.personName}</button>
          <p className="text-[12.5px] text-slate-500 truncate">{emp.designation || "—"}</p>
        </div>
      </div>
      <button type="button" onClick={() => setOpen(o => !o)} title="Details"
        className={`absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center transition-colors ${open ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}>
        <MoreHorizontal size={16} />
      </button>

      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Field label="Department">
          {emp.department
            ? <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[[...emp.department].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length][0] }} /><span className="truncate">{emp.department}</span></span>
            : "—"}
        </Field>
        <Field label="Location"><span title={place || ""}>{place || "—"}</span></Field>
        <div className="col-span-2 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Field label="Email">
              {emp.email ? <a href={`mailto:${emp.email}`} className="text-blue-600 hover:underline">{emp.email}</a> : "—"}
            </Field>
          </div>
          {emp.email && (
            <button type="button" onClick={copyEmail} title={copied ? "Copied" : "Copy email"}
              className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${copied ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div data-stop className="absolute z-30 right-3 top-11 w-max cursor-default min-w-[340px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <Avatar name={emp.personName} size="sm" imgUrl={imgUrl} square />
            <p className="flex-1 min-w-0 text-[14px] font-semibold text-slate-800 truncate">{emp.personName}</p>
            <button type="button" onClick={() => { setOpen(false); onOpen(); }} title="Open profile" className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"><ExternalLink size={15} /></button>
            <button type="button" onClick={() => setOpen(false)} title="Close" className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={15} /></button>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div>
              <p className="text-[12px] font-semibold text-slate-500 mb-1">Contact Details</p>
              <p className="flex items-center gap-2 text-[13px] text-slate-700 whitespace-nowrap"><Mail size={13} className="text-slate-400 shrink-0" />{emp.email || "—"}</p>
              <p className="flex items-center gap-2 text-[13px] text-slate-700 mt-1"><Phone size={13} className="text-slate-400 shrink-0" />{emp.contactNumber || "—"}</p>
            </div>
            <div className="grid grid-cols-[auto_auto] gap-x-8 gap-y-2.5 pt-1">
              <Item label="Location" value={place} />
              <Item label="Employee ID" value={emp.employeeId} />
              <Item label="Job Title" value={emp.designation} />
              <Item label="Department" value={emp.department} />
              <Item label="Reporting To" value={emp.reportingTo} />
              <Item label="Company" value={emp.company} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
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

/* one field of a profile section — empty ones offer "+ Add" (opens Edit) */
function InfoBox({ label, value, span2, onAdd }) {
  return (
    <div className={`min-w-0 ${span2 ? "col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 text-[13px] font-medium text-slate-800 break-words">
        {value || (onAdd
          ? <button type="button" onClick={onAdd} className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[12px] font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-200">+ Add</button>
          : <span className="text-slate-300 font-normal">—</span>)}
      </div>
    </div>
  );
}

/* profile section card: title · "x of y filled" · pencil */
function InfoCard({ title, fields, onEdit, onAdd }) {
  const filled = fields.filter(f => f.value).length;
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-[14px] font-semibold text-slate-800">{title}</h3>
        <span className="text-[11px] text-slate-400">{filled} of {fields.length} filled</span>
        {onEdit && <button type="button" onClick={onEdit} title="Edit" className="ml-auto p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Edit2 size={13} /></button>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 p-5">
        {fields.map(f => <InfoBox key={f.label} label={f.label} value={f.value} onAdd={onAdd} />)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════
   DETAIL VIEW
═══════════════════════════════ */
const DETAIL_TABS = ["Overview", "Documents"];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/* small copy button — turns into a ✓ for a moment */
function CopyBtn({ text, what = "" }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title={done ? "Copied" : `Copy ${what.toLowerCase()}`}
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}>
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

/* the employee a typed name points to — "Ravi Kant" = "Ravikant", "Dr. X" = "X",
   and a one-letter slip (Reja / Raja) still finds them; active people first */
const normName = (n) => String(n || "").toLowerCase().replace(/^(dr|mr|mrs|ms|er|ca)\.?\s+/, "").replace(/[^a-z]/g, "");
function nameGap(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function findPerson(emps, name, selfId) {
  const n = normName(name);
  if (!n) return null;
  const pool = emps.filter(e => e.id !== selfId).sort((x, y) => (x.status === "inactive") - (y.status === "inactive"));
  return pool.find(e => normName(e.personName) === n)
    || pool.find(e => nameGap(normName(e.personName), n) <= 2 && normName(e.personName)[0] === n[0])
    || null;
}

function EmployeeDetail({ emp, imgUrl, opts, emps = [], onOpenEmp, onBack, onEdit, onFill, onMove, onDelete }) {
  const [tab, setTab] = useState("Overview");
  const place   = postedLabel(emp, opts);
  const manager = findPerson(emps, emp.reportingTo, emp.id);

  const sections = [
    { title: "Personal", fields: [
      { label: "Date of Birth",  value: fmtDate(emp.dateOfBirth) },
      { label: "Gender",         value: emp.gender },
      { label: "Marital Status", value: emp.maritalStatus },
      { label: "Nationality",    value: emp.nationality },
    ] },
    { title: "Contact details", fields: [
      { label: "Email",           value: emp.email },
      { label: "Mobile",          value: emp.contactNumber },
      { label: "Alternate Phone", value: emp.alternatePhone },
      { label: "Address",         value: emp.address },
    ] },
    { title: "Job", fields: [
      { label: "Employed Through", value: agencyName(emp, opts) },
      { label: "Grade",            value: emp.grade && <GradeBadge grade={emp.grade} /> },
      { label: "Team",             value: emp.team },
    ] },
  ];
  const all     = sections.flatMap(x => x.fields);
  const missing = all.filter(f => !f.value).length;
  const pct     = Math.round(((all.length - missing) / all.length) * 100);

  return (
    <div className="min-h-[100svh] bg-[#f5f6f8]">
      {/* top stays put (sticky to the page scroll): back · actions · header card */}
      <div className="sticky top-0 z-20 bg-[#f5f6f8] px-4 sm:px-6 pt-4 pb-4 space-y-4 border-b border-slate-200/70">

        {/* back · actions */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800 font-medium">
            <ChevronLeft size={15} /> Back to Employees
          </button>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button onClick={onDelete} title="Delete"
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-red-500 hover:bg-red-50 hover:border-red-200">
                <Trash2 size={14} />
              </button>
            )}
            {onMove && (
              <button onClick={onMove} className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                <ArrowRightLeft size={13} /> Move
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit} className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-700">
                <Edit2 size={13} /> Edit profile
              </button>
            )}
          </div>
        </div>

        {/* header card — soft colour wash, photo · name, facts as tinted tiles */}
        <div className="relative overflow-hidden bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-x-6 gap-y-4 flex-wrap">
          <div className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(600px 160px at 0% 0%, rgba(59,130,246,.10), transparent 70%), radial-gradient(500px 160px at 100% 100%, rgba(16,185,129,.08), transparent 70%)" }} />
          <div className="relative flex items-center gap-4 min-w-0 pr-2">
            <div className="rounded-full ring-4 ring-white shadow-md">
              <PhotoAvatar name={emp.personName} imgUrl={imgUrl} size="2xl" round />
            </div>
            <div className="min-w-0">
              <h2 className="text-[19px] font-bold text-slate-800 leading-tight">{emp.personName}</h2>
              <p className="mt-1 text-[12.5px] text-slate-500">{emp.designation || "—"}</p>
              <span className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${(STATUS[emp.status] || STATUS.active).cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${(STATUS[emp.status] || STATUS.active).dot}`} />{(STATUS[emp.status] || STATUS.active).label}
              </span>
            </div>
          </div>
          <div className="relative flex-1 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-2.5">
            {[
              { Icon: Users,      tint: "bg-violet-50 text-violet-600",   label: "Department",  value: emp.department },
              { Icon: Briefcase,  tint: "bg-amber-50 text-amber-600",     label: "Category",    value: emp.category },
              { Icon: BadgeCheck, tint: "bg-blue-50 text-blue-600",       label: "Employee ID", value: emp.employeeId },
              { Icon: Calendar,   tint: "bg-emerald-50 text-emerald-600", label: "Joined",      value: fmtDate(emp.joiningDate) },
              { Icon: MapPin,     tint: "bg-rose-50 text-rose-500",       label: "Posted at",   value: place },
            ].map(({ Icon, tint, label, value }) => (
              <div key={label} className="flex items-center gap-2.5 min-w-0 rounded-lg bg-white/80 border border-slate-100 px-3 py-2.5">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tint}`}><Icon size={15} /></span>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p title={value || ""} className={`text-[13px] font-semibold truncate ${value ? "text-slate-800" : "text-slate-300"}`}>{value || "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* profile completeness · tabs — same row, same height, still in the fixed top */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* completeness: a ring that fills up, colour by how far along */}
          {(() => {
            const c = pct === 100 ? "#10b981" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";
            const r = 15, len = 2 * Math.PI * r;
            return (
              <div className="h-11 bg-white rounded-xl border border-slate-200 pl-1.5 pr-1.5 flex items-center gap-2.5">
                <div className="relative w-9 h-9 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                    <circle cx="18" cy="18" r={r} fill="none" stroke="#eef2f7" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round"
                      strokeDasharray={len} strokeDashoffset={len * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9.5px] font-bold" style={{ color: c }}>{pct}%</span>
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[12px] font-semibold text-slate-800">{pct === 100 ? "Profile complete" : "Profile completion"}</p>
                  <p className="text-[11px] text-slate-400">{missing ? `${missing} detail${missing > 1 ? "s" : ""} missing` : "All details filled ✓"}</p>
                </div>
                {missing > 0 && (onFill || onEdit) && (
                  <button type="button" onClick={onFill || onEdit}
                    className="shrink-0 h-8 px-3 rounded-lg text-[12px] font-semibold text-white shadow-sm hover:brightness-110 transition"
                    style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
                    Fill now
                  </button>
                )}
              </div>
            );
          })()}
          <div className="h-11 justify-self-start bg-white rounded-xl border border-slate-200 px-1 flex items-center gap-1">
            {DETAIL_TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium outline-none transition-colors ${tab === t ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
          {/* left: quick contact + organisation */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Quick contact</h3>
              <div className="space-y-3">
                {[
                  { Icon: Mail,  tint: "bg-blue-50 text-blue-600",       label: "Email",  value: emp.email, href: emp.email && `mailto:${emp.email}` },
                  { Icon: Phone, tint: "bg-emerald-50 text-emerald-600", label: "Mobile", value: emp.contactNumber, href: emp.contactNumber && `tel:${emp.contactNumber}` },
                ].map(({ Icon, tint, label, value, href }) => (
                  <div key={label} className="flex items-center gap-3 min-w-0">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tint}`}><Icon size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-400">{label}</p>
                      {value
                        ? <a href={href} className={`block text-[13px] font-medium break-all leading-snug hover:underline ${label === "Email" ? "text-blue-600" : "text-slate-800"}`}>{value}</a>
                        : <p className="text-[13px] text-slate-300">—</p>}
                    </div>
                    {value && <CopyBtn text={value} what={label} />}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Organisation</h3>
              <div className="space-y-3">
                {[["Company", emp.company], ["Department", emp.department]].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className={`mt-0.5 text-[13px] font-medium ${value ? "text-slate-800" : "text-slate-300"}`}>{value || "—"}</p>
                  </div>
                ))}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reports to</p>
                  {emp.reportingTo ? (
                    <button type="button" disabled={!manager} onClick={() => manager && onOpenEmp?.(manager)}
                      className="mt-1.5 w-full flex items-center gap-2.5 rounded-lg py-1 text-left enabled:hover:bg-slate-50">
                      <Avatar name={emp.reportingTo} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-slate-800 truncate">{emp.reportingTo}</span>
                        {manager?.designation && <span className="block text-[11px] text-slate-400 truncate">{manager.designation}</span>}
                      </span>
                      {manager && <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                    </button>
                  ) : <p className="mt-0.5 text-[13px] text-slate-300">—</p>}
                </div>
              </div>
            </div>
          </div>

          {/* right: tabs + sections */}
          <div className="space-y-4 min-w-0">
            {tab === "Overview"
              ? sections.map(x => <InfoCard key={x.title} title={x.title} fields={x.fields} onEdit={onEdit} onAdd={onFill || onEdit} />)
              : <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-40 text-slate-300 text-sm">{tab} — coming soon</div>}
          </div>
        </div>
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

/* A value picked from a Settings › Organisation list. A value the
   employee already has that isn't in the list is kept and flagged, so
   nothing is lost; it can be added to the list or changed. */
function ListPick({ value, onChange, options, what, empty }) {
  const inList = !value || options.some(o => o.toLowerCase() === String(value).toLowerCase());
  return (
    <>
      <select value={value || ""} onChange={e => onChange(e.target.value)} className={SEL}>
        <option value="">{options.length ? "— Select —" : (empty || `No ${what.toLowerCase()} yet`)}</option>
        {!inList && <option value={value}>{value} (not in list)</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {!inList && <p className="mt-1 text-[10px] font-semibold text-amber-600">Not in {what} — add it in Settings › Organisation › {what}, or pick one</p>}
    </>
  );
}

function EmpModal({ form, setForm, editId, saving, onClose, onSave, allEmps, opts, onMissing, photo, setPhoto, photoUrl }) {
  const orgId = useOrgId();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const [gradeList, setGradeList] = useState([]);
  const [desigList, setDesigList] = useState([]);
  const [deptList,  setDeptList]  = useState([]);
  const [teamList,  setTeamList]  = useState([]);
  const [appUsers,  setAppUsers]  = useState([]);
  useEffect(() => {
    fetch(`${API}/api/organisation/app-users`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setAppUsers(d.users || [])).catch(() => {});
    // Department, Team and Designation come from Settings › Organisation
    fetch(scopedUrl(`${API}/api/departments`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setDeptList((d.departments || []).filter(x => x.status !== "inactive"))).catch(() => {});
    fetch(scopedUrl(`${API}/api/teams`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setTeamList((d.teams || []).filter(x => x.status !== "inactive"))).catch(() => {});
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

          {/* Photo — saved together with the form */}
          {setPhoto && (() => {
            const shown = photo?.remove ? null : (photo?.preview || photoUrl);
            return (
              <div className="flex items-center gap-4">
                <Avatar name={form.personName || "?"} size="xl" imgUrl={shown} />
                <div>
                  <p className="text-[13px] font-semibold text-slate-700">Photo</p>
                  <p className="text-[11px] text-slate-400 mb-2">JPG or PNG, a clear face photo works best</p>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                      {shown ? "Change photo" : "Upload photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const f = e.target.files?.[0]; e.target.value = "";
                        if (f) setPhoto({ file: f, preview: URL.createObjectURL(f) });
                      }} />
                    </label>
                    {shown && <button type="button" onClick={() => setPhoto({ remove: true })} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-red-500 hover:bg-red-50">Remove</button>}
                  </div>
                </div>
              </div>
            );
          })()}

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
                <label className={LBL}>Mobile{String(form.employeeId || "").trim() ? "" : " *"}</label>
                <input value={form.contactNumber} onChange={set("contactNumber")} placeholder={String(form.employeeId || "").trim() ? "Optional (has Employee ID)" : "9876543210"} inputMode="numeric" className={INP} />
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
                <ListPick value={form.designation} onChange={v => handleDesigChange({ target: { value: v } })}
                  options={desigList.map(d => d.title)} what="Designations" />
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
                <label className={LBL}>Department</label>
                <ListPick value={form.department} what="Departments" options={deptList.map(d => d.name)}
                  onChange={v => setForm(f => ({ ...f, department: v, team: "" }))} />
              </div>
              <div>
                <label className={LBL}>Team</label>
                <ListPick value={form.team} what="Teams" onChange={v => setForm(f => ({ ...f, team: v }))}
                  options={teamList.filter(t => { const d = deptList.find(x => x.name === form.department); return !d || !t.department_id || String(t.department_id) === String(d.id); }).map(t => t.name)}
                  empty={form.department ? "No team in this department" : "Pick the department first"} />
              </div>
              <div className="col-span-2">
                <label className={LBL}>Designation</label>
                <ListPick value={form.designation} onChange={v => handleDesigChange({ target: { value: v } })}
                  options={desigList.map(d => d.title)} what="Designations" />
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
                <ListPick value={form.reportingTo} what="Employees" onChange={v => setForm(f => ({ ...f, reportingTo: v }))}
                  options={[...new Set(allEmps.filter(e => e.personName && e.id !== editId && e.status !== "inactive").map(e => e.personName))].sort()} />
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
                <label className={LBL}>App Login</label>
                <select value={form.userId || ""} onChange={set("userId")} className={SEL}>
                  <option value="">— No login —</option>
                  {appUsers.map(u => {
                    const elsewhere = u.linkedTo && u.linkedTo.id !== editId;
                    return <option key={u.id} value={u.id} disabled={elsewhere}>{u.name} · {u.email}{elsewhere ? ` — linked to ${u.linkedTo.name}` : ""}{u.active ? "" : " (inactive)"}</option>;
                  })}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">The Zyhawk login this person uses (Settings › User Management). Approvals and the Org Chart use it.</p>
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
          {/* came here from "Fill missing details" — go back to just those */}
          {onMissing && <button onClick={onMissing} className="mr-auto text-[13px] font-medium text-blue-600 hover:underline">← Only missing details</button>}
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

/* "Fill now" — only the details this employee is missing, nothing else */
const FILL_FIELDS = [
  { key: "dateOfBirth",    label: "Date of Birth",   type: "date" },
  { key: "gender",         label: "Gender",          options: ["Male", "Female", "Other"] },
  { key: "maritalStatus",  label: "Marital Status",  options: ["Single", "Married"] },
  { key: "nationality",    label: "Nationality",     placeholder: "e.g. Indian" },
  { key: "email",          label: "Email",           type: "email", placeholder: "name@company.com" },
  { key: "contactNumber",  label: "Mobile",          placeholder: "10-digit mobile" },
  { key: "alternatePhone", label: "Alternate Phone", placeholder: "Optional" },
  { key: "grade",          label: "Grade",           list: "grades" },
  { key: "team",           label: "Team",            list: "teams" },
  { key: "address",        label: "Address",         textarea: true, placeholder: "Residential address…" },
];

function FillMissingModal({ emp, form, setForm, saving, onClose, onSave, onFull }) {
  const orgId = useOrgId();
  // which ones were empty when it opened — so a field doesn't vanish while typing
  const [keys] = useState(() => FILL_FIELDS.filter(f => !String(emp[f.key] || "").trim()).map(f => f.key));
  const [lists, setLists] = useState({ grades: [], teams: [] });
  useEffect(() => {
    const h = { headers: { Authorization: `Bearer ${TOKEN()}` } };
    if (keys.includes("grade")) fetch(scopedUrl(`${API}/api/organisation/grades`, orgId), h).then(r => r.json())
      .then(d => setLists(l => ({ ...l, grades: (d.grades || []).filter(g => g.status === "active").sort((a, b) => (a.sort_order ?? 1) - (b.sort_order ?? 1)).map(g => [g.grade, g.grade + (descriptionsLabel(g) ? ` — ${descriptionsLabel(g)}` : "")]) }))).catch(() => {});
    if (keys.includes("team")) fetch(scopedUrl(`${API}/api/teams`, orgId), h).then(r => r.json())
      .then(d => setLists(l => ({ ...l, teams: (d.teams || []).filter(t => t.status !== "inactive").map(t => [t.name, t.name]) }))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const fields = FILL_FIELDS.filter(f => keys.includes(f.key));

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-[15px] font-bold text-slate-800">Fill missing details</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">{emp.personName} · {fields.length} missing</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 overflow-y-auto">
          {fields.length === 0 && <p className="col-span-2 text-sm text-slate-400 text-center py-6">Nothing missing — all details are filled.</p>}
          {fields.map(f => {
            const opts = f.options ? f.options.map(o => [o, o]) : f.list ? lists[f.list] : null;
            return (
              <div key={f.key} className={f.textarea ? "col-span-2" : ""}>
                <label className={LBL}>{f.label}</label>
                {f.textarea
                  ? <textarea value={form[f.key] || ""} onChange={set(f.key)} rows={2} placeholder={f.placeholder} className={`${INP} resize-none`} />
                  : opts
                    ? <select value={form[f.key] || ""} onChange={set(f.key)} className={SEL}>
                        <option value="">— Select —</option>
                        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    : <input type={f.type || "text"} value={form[f.key] || ""} onChange={set(f.key)} placeholder={f.placeholder} className={INP} />}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          {/* switch to the whole form — what's typed here is kept */}
          {onFull && <button onClick={onFull} className="mr-auto text-[13px] font-medium text-blue-600 hover:underline">See full form →</button>}
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          {fields.length > 0 && (
            <button onClick={onSave} disabled={saving}
              className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Save
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ═══════════════════════════════
   EMPTY FORM
═══════════════════════════════ */
const EMPTY_FORM = {
  personName: "", employeeId: "", status: "active", staffType: "",
  department: "", designation: "", grade: "", team: "", role: "",
  reportingTo: "", workLocation: "", joiningDate: "", dateOfBirth: "",
  gender: "", maritalStatus: "", nationality: "",
  contactNumber: "", alternatePhone: "", email: "", address: "",
  company: "", bio: "", tags: "", userId: "",
  category: "", postedKind: "project", postedId: "", employedThrough: "direct", agencyVendorId: "",
};

/* ═══════════════════════════════
   MAIN COMPONENT
═══════════════════════════════ */
/* ── "Filters" button — Department / Staff Type in one popover ── */

/* ── Category picker in the header — same size as the Filters button ── */
const CATEGORY_DOT = {
  "Office Staff": "bg-blue-500", "Site Staff": "bg-teal-500", "Guard": "bg-slate-500",
  "Driver": "bg-violet-500", "Cook": "bg-rose-500",
};


function EmpFilters({ filters, depts, categories, onChange, onClear }) {
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
          {field("Category", "cat", categories)}
          {field("Department", "dept", depts.map(d => [d, d]))}
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

export default function EmployeeList({ actionsRef, view = "card", onViewChange, onCountChange, toolbarSlot, onDetailChange }) {
  const { canEdit, canDelete } = useModulePermissions("employees");
  const orgId = useOrgId();
  const [emps,    setEmps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState("");
  const [filterDept,   setFilterDept]   = useState("");
  // Active (default) / Inactive — people who left are kept, just apart
  const [statusTab, setStatusTab] = useState("active");
  const inTab = (e) => statusTab === "inactive" ? e.status === "inactive" : e.status !== "inactive";
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
  const [moveEmps,   setMoveEmps]  = useState(null);
  const importRef = useRef(null);


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

  const [photo, setPhoto] = useState(null);           // picked in the form: { file, preview } or { remove: true }
  const [fillOnly, setFillOnly] = useState(false);   // modal shows only the missing details
  const [fillBack, setFillBack] = useState(false);   // full form opened from it — offer the way back
  const openAdd  = () => { setForm({ ...EMPTY_FORM, category }); setEditId(null); setFillOnly(false); setPhoto(null); setModal(true); };

  /* photo: upload / remove right away and show it everywhere without a reload */
  const putPhoto = (id, path, url) => {
    setEmps(prev => prev.map(e => e.id === id ? { ...e, profileImage: path } : e));
    setImgUrls(m => { const n = { ...m }; if (url) n[id] = url; else delete n[id]; return n; });
    setSelected(sel => sel?.id === id ? { ...sel, profileImage: path } : sel);
    if (selected?.id === id) setSelectedImgUrl(url || null);
  };
  const uploadPhoto = async (id, file) => {
    const fd = new FormData(); fd.append("image", file);
    const res = await authFetch(`${API}/api/organisation/employees/${id}/profile-image`, { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || "Photo upload failed");
    putPhoto(id, d.path, URL.createObjectURL(file));
  };
  const removePhoto = async (id) => {
    const res = await authFetch(`${API}/api/organisation/employees/${id}/profile-image`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not remove the photo");
    putPhoto(id, "", null);
  };
  const openFill = (emp) => { openEdit(emp); setFillOnly(true); };
  const openEdit = (emp) => {
    setFillOnly(false); setFillBack(false); setPhoto(null);
    setForm({
      personName: emp.personName || "", employeeId: emp.employeeId || "",
      status: emp.status || "active",
      staffType: emp.staffType || "",
      department: emp.department || "", designation: emp.designation || "",
      grade: emp.grade || "", team: emp.team || "", role: emp.role || "",
      reportingTo: emp.reportingTo || "", workLocation: emp.workLocation || "",
      userId: emp.userId || "",
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
    // an Employee ID or a mobile — one is enough (guards have no ID, Keka staff may have no mobile here)
    if (digits(form.contactNumber) && digits(form.contactNumber).length < 10) { showToast("Mobile number should be 10 digits", "error"); return; }
    if (!digits(form.contactNumber) && !String(form.employeeId || "").trim()) { showToast("Give a mobile number or an Employee ID", "error"); return; }
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
      // the photo picked in the form goes up after the employee is saved
      if (savedId && photo) {
        try {
          if (photo.file) await uploadPhoto(savedId, photo.file);
          else if (photo.remove) await removePhoto(savedId);
        } catch (e) { showToast(e.message, "error"); }
        setPhoto(null);
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

  // profile open → the page header above the list is hidden (index.jsx)
  useEffect(() => { onDetailChange?.(!!selected); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDetailChange?.(false), []);              // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Filter ── */
  const allDepts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort();

  const filtered = emps.filter(e => {
    const q   = search.toLowerCase();
    return (
      (!search || [e.personName, e.employeeId, e.designation, e.department, e.contactNumber].some(v => v?.toLowerCase().includes(q))) &&
      (!filterDept   || e.department === filterDept) &&
      inTab(e) &&
      (!filterType   || e.staffType === filterType) &&
      (!category     || e.category === category)
    );
  });

  // Guards / Drivers / Cooks have no department or grade —
  // their tabs show who they come through instead
  const workerTab = SHORT_FORM.includes(category);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);
  // fixed footer with paging — same for the table and the cards
  const pageFooter = (
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
  );

  useEffect(() => { onCountChange?.(filtered.length); }, [filtered.length]);

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = filtered.map((e, i) => ({
      "#": i + 1, "Emp ID": e.employeeId, "Name": e.personName,
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
      head: [["#", "Emp ID", "Name", "Department", "Designation", "Grade", "Status", "Staff Type"]],
      body: filtered.map((e, i) => [
        i + 1, e.employeeId, e.personName,
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
    const headers = ["Person Name", "Phone", "Employee ID", "Category", "Posted At", "Employed Through", "Agency", "Company", "Department", "Designation", "Grade", "Team", "Role", "Reporting Manager", "Joining Date", "Status", "Staff Type", "Email", "Gender", "Marital Status", "Nationality", "Address"];
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

  /* ── Detail screen — takes the whole page; the list header is hidden (index.jsx) ── */
  if (selected) {
    return (
      <div className="-my-5 -mx-4 sm:-mx-5 lg:-mx-6">
        <EmployeeDetail
          emp={selected}
          emps={emps}
          onOpenEmp={setSelected}
          imgUrl={selectedImgUrl}
          opts={opts}
          onBack={() => setSelected(null)}
          onEdit={canEdit ? () => openEdit(selected) : undefined}
          onFill={canEdit ? () => openFill(selected) : undefined}
          onMove={canEdit ? () => setMoveEmps([selected]) : undefined}
          onDelete={canDelete ? () => handleDelete(selected.id) : undefined}
        />
        {modal && (fillOnly
          ? <FillMissingModal emp={selected} form={form} setForm={setForm} saving={saving}
              onClose={() => setModal(false)} onSave={handleSave} onFull={() => { setFillOnly(false); setFillBack(true); }} />
          : <EmpModal form={form} setForm={setForm} editId={editId} saving={saving}
              onClose={() => setModal(false)} onSave={handleSave} allEmps={emps} opts={opts}
              photo={photo} setPhoto={setPhoto} photoUrl={editId ? (imgUrls[editId] || (selected?.id === editId ? selectedImgUrl : null)) : null}
              onMissing={fillBack ? () => { setFillOnly(true); setFillBack(false); } : undefined} />
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
        const nActive = emps.filter(e => e.status !== "inactive").length;
        const bar = (
          <>
            <div className="flex items-center bg-slate-100 rounded-md p-0.5 shrink-0">
              {[["active", "Active", nActive], ["inactive", "Inactive", emps.length - nActive]].map(([id, label, n]) => (
                <button key={id} type="button" onClick={() => { setStatusTab(id); setPage(1); }}
                  className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs font-semibold transition-all
                    ${statusTab === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {label} <span className={`text-[10px] tabular-nums ${statusTab === id ? (id === "inactive" ? "text-red-500" : "text-emerald-600") : "text-slate-400"}`}>{n}</span>
                </button>
              ))}
            </div>
            {/* the search gives way first, so the header stays on one line */}
            <div className="relative flex-1 min-w-[120px] max-w-[240px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search employees…"
                className="pl-8 pr-3 py-[7px] text-xs border border-slate-200 rounded-md bg-slate-50 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white" />
            </div>
            <EmpFilters
              filters={{ cat: category, dept: filterDept, type: filterType }}
              depts={allDepts}
              categories={CATEGORIES.map(c => [c, `${c} · ${emps.filter(e => inTab(e) && (e.category || "Office Staff") === c).length}`])}
              onChange={(k, v) => {
                ({ cat: setCategory, dept: setFilterDept, type: setFilterType })[k](v);
                setPage(1);
              }}
              onClear={() => { setCategory(""); setFilterDept(""); setFilterType(""); setPage(1); }} />
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
          <p className="text-sm">{search || filterDept || filterType || category ? "No employees match your filters" : statusTab === "inactive" ? "No inactive employees" : "No employees yet — add one above"}</p>
        </div>
      ) : view === "card" ? (

        /* ── CARD VIEW — like Keka's directory: photo, name, title, department,
           location, email; "⋯" by the name shows the details ── */
        <>
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {paginated.map(emp => (
              <EmpCard key={emp.id} emp={emp} imgUrl={imgUrls[emp.id]} place={postedLabel(emp, opts)} onOpen={() => setSelected(emp)} />
            ))}
          </div>
          {/* footer sits on the bottom edge, full width — like the header on top
              (negative margins undo the page padding in index.jsx) */}
          <div className="sticky bottom-0 z-20 mt-auto -mx-4 sm:-mx-5 lg:-mx-6 -mb-5 bg-white border-t border-slate-200 [&>div]:border-t-0 [&>div]:px-5 sm:[&>div]:px-6">{pageFooter}</div>
        </>

      ) : (

        /* ── TABLE VIEW ── */
        <div className="bg-white rounded-lg border border-slate-200 flex flex-col" style={{ height: "calc(100svh - 110px)" }}>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
              <thead className="sticky top-0 z-[20]">
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th style={{ width: 110, minWidth: 110, left: 0 }} className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap sticky z-[22]">Contact ID</th>
                  <th style={{ minWidth: 180, left: 110 }} className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap sticky z-[22]">Name</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Emp ID</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Category</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Posted At</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Mobile</th>
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
                  const td = "px-4 py-3 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";
                  return (
                    <tr key={emp.id} className="group cursor-pointer" onClick={() => setSelected(emp)}>
                      <td style={{ width: 110, minWidth: 110, left: 0 }} className="px-4 py-3 border-b border-r border-slate-200 text-xs font-medium text-slate-500 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky z-[5]">{emp.contactCode || "—"}</td>
                      <td style={{ minWidth: 180, left: 110 }} className="px-4 py-3 border-b border-r border-slate-200 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky z-[5]">
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

          {pageFooter}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <EmpModal form={form} setForm={setForm} editId={editId} saving={saving}
          onClose={() => setModal(false)} onSave={handleSave} allEmps={emps} opts={opts}
              photo={photo} setPhoto={setPhoto} photoUrl={editId ? (imgUrls[editId] || (selected?.id === editId ? selectedImgUrl : null)) : null} />
      )}
      {logEmp && <ContactLogModal contact={logEmp} onClose={() => setLogEmp(null)} />}
      {moveModal}
    </>
  );
}
