import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search, Plus, X, Edit2, Trash2, Loader2, ChevronLeft,
  BadgeCheck, Calendar, UserCheck, MapPin,
  Briefcase, Building2, ChevronDown, Users, Clock,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { loadGrades, gradeCls, descriptionsLabel } from "./Grades";
import { loadDesignations } from "./Designations";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 20;

/* ── Grade letter → active grade list (user-defined order) ── */
const loadActiveGrades = () =>
  loadGrades().filter(g => g.status === "active").sort((a, b) => (a.order || 0) - (b.order || 0));

/* ── Status config ── */
const STATUS = {
  active:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  inactive: { label: "Inactive", cls: "bg-red-50 text-red-500 border border-red-200",             dot: "bg-red-400",    bar: "bg-red-400"     },
  on_leave: { label: "On Leave", cls: "bg-amber-50 text-amber-700 border border-amber-200",        dot: "bg-amber-400",  bar: "bg-amber-400"   },
};

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

function EmployeeDetail({ emp, imgUrl, onBack, onEdit, onDelete }) {
  const [tab, setTab] = useState("Overview");
  const s   = STATUS[emp.status || "active"];
  const div = emp.division || emp.company || "";
  const grd = emp.grade || "";

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Back + actions */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors">
          <ChevronLeft size={15} /> Back to Employees
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors">
            <Edit2 size={13} /> Edit
          </button>
          <button onClick={onDelete}
            className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
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
            { Icon: MapPin,     label: "Work Location",     value: emp.workLocation },
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
                <InfoBox label="Phone (Primary)" value={emp.contactNumber} />
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

function EmpModal({ form, setForm, editId, saving, onClose, onSave, divisions, allEmps }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  /* grades and designations from localStorage */
  const gradeList = useMemo(() => loadActiveGrades(), []);
  const desigList = useMemo(() => loadDesignations(), []);

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
                <label className={LBL}>Employee ID *</label>
                <input value={form.employeeId} onChange={set("employeeId")} placeholder="e.g. BITL-001" className={INP} />
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
                <label className={LBL}>Joining Date</label>
                <input type="date" value={form.joiningDate} onChange={set("joiningDate")} className={INP} />
              </div>
              <div>
                <label className={LBL}>Work Location</label>
                <input value={form.workLocation} onChange={set("workLocation")} placeholder="e.g. Delhi Office" className={INP} />
              </div>
            </div>
          </div>

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
                <label className={LBL}>Phone (Primary)</label>
                <input value={form.contactNumber} onChange={set("contactNumber")} placeholder="9876543210" className={INP} />
              </div>
              <div>
                <label className={LBL}>Phone (Alternate)</label>
                <input value={form.alternatePhone} onChange={set("alternatePhone")} placeholder="Optional" className={INP} />
              </div>
              <div>
                <label className={LBL}>Work Email</label>
                <input type="email" value={form.email} onChange={set("email")} placeholder="name@company.com" className={INP} />
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
  personName: "", employeeId: "", status: "active",
  division: "", department: "", designation: "", grade: "", team: "", role: "",
  reportingTo: "", workLocation: "", joiningDate: "", dateOfBirth: "",
  gender: "", maritalStatus: "", nationality: "",
  contactNumber: "", alternatePhone: "", email: "", address: "",
  company: "", bio: "", tags: "",
};

/* ═══════════════════════════════
   MAIN COMPONENT
═══════════════════════════════ */
export default function EmployeeList({ actionsRef, view = "card", onViewChange, onCountChange }) {
  const [emps,    setEmps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState("");
  const [filterDiv,    setFilterDiv]    = useState("");
  const [filterDept,   setFilterDept]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [modal,      setModal]     = useState(false);
  const [form,       setForm]      = useState(EMPTY_FORM);
  const [editId,     setEditId]    = useState(null);
  const [saving,     setSaving]    = useState(false);
  const [page,       setPage]      = useState(1);
  const [perPage,    setPerPage]   = useState(20);
  const [imgUrls,    setImgUrls]   = useState({});
  const [selectedImgUrl, setSelectedImgUrl] = useState(null);
  const [toast,      setToast]     = useState(null);
  const [importing,  setImporting] = useState(false);
  const importRef = useRef(null);

  const divisions = useMemo(() => { try { return JSON.parse(localStorage.getItem("bms_org_divisions") || "[]"); } catch { return []; } }, []);

  useEffect(() => { fetchEmps(); }, []);

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
      body: JSON.stringify({ bucket: "procurement-images", paths: withImg.map(c => c.profileImage) }),
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
      body: JSON.stringify({ bucket: "procurement-images", paths: [selected.profileImage] }),
    }).then(r => r.json()).then(d => {
      const url = d.urls?.[selected.profileImage];
      if (url) setSelectedImgUrl(url);
    }).catch(() => {});
  }, [selected?.id, selected?.profileImage]);

  const fetchEmps = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/contacts`);
      const data = await res.json();
      setEmps(data.contacts || []);
    } catch { setEmps([]); }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const openAdd  = () => { setForm(EMPTY_FORM); setEditId(null); setModal(true); };
  const openEdit = (emp) => {
    setForm({
      personName: emp.personName || "", employeeId: emp.employeeId || "",
      status: emp.status || "active",
      division: emp.division || emp.company || "",
      department: emp.department || "", designation: emp.designation || "",
      grade: emp.grade || "", team: emp.team || "", role: emp.role || "",
      reportingTo: emp.reportingTo || "", workLocation: emp.workLocation || "",
      joiningDate: emp.joiningDate || "", dateOfBirth: emp.dateOfBirth || "",
      gender: emp.gender || "", maritalStatus: emp.maritalStatus || "",
      nationality: emp.nationality || "", contactNumber: emp.contactNumber || "",
      alternatePhone: emp.alternatePhone || "", email: emp.email || "",
      address: emp.address || "", bio: emp.bio || "", tags: emp.tags || "",
      company: emp.company || "",
    });
    setEditId(emp.id);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.personName.trim()) { showToast("Name is required", "error"); return; }
    if (!form.employeeId.trim()) { showToast("Employee ID is required", "error"); return; }
    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, company: form.division || form.company, createdById: u.id || "", createdByName: u.name || "" };
      const url    = editId ? `${API}/api/procurement/contacts/${editId}` : `${API}/api/procurement/contacts`;
      const method = editId ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!data.success) throw new Error(data.error);
      if (editId) {
        const updated = { ...emps.find(e => e.id === editId), ...form };
        setEmps(prev => prev.map(e => e.id === editId ? updated : e));
        if (selected?.id === editId) setSelected(updated);
      } else {
        await fetchEmps();
      }
      showToast(editId ? "Employee updated" : "Employee added");
      setModal(false);
    } catch { showToast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this employee?")) return;
    try {
      await fetch(`${API}/api/procurement/contacts/${id}`, { method: "DELETE" });
      setEmps(prev => prev.filter(e => e.id !== id));
      if (selected?.id === id) setSelected(null);
      showToast("Employee deleted");
    } catch { showToast("Failed to delete", "error"); }
  };

  /* ── Filter ── */
  const allDivs  = [...new Set(emps.map(e => e.division || e.company || "").filter(Boolean))].sort();
  const allDepts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort();

  const filtered = emps.filter(e => {
    const div = e.division || e.company || "";
    const q   = search.toLowerCase();
    return (
      (!search || [e.personName, e.employeeId, e.designation, e.department, div].some(v => v?.toLowerCase().includes(q))) &&
      (!filterDiv    || div === filterDiv) &&
      (!filterDept   || e.department === filterDept) &&
      (!filterStatus || e.status === filterStatus)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { onCountChange?.(filtered.length); }, [filtered.length]);

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = filtered.map((e, i) => ({
      "#": i + 1, "Emp ID": e.employeeId, "Name": e.personName,
      "Division": e.division || e.company || "",
      "Department": e.department || "", "Designation": e.designation || "",
      "Grade": e.grade || "", "Status": STATUS[e.status]?.label || "Active",
      "Phone": e.contactNumber || "", "Email": e.email || "",
      "Reporting Manager": e.reportingTo || "", "Work Location": e.workLocation || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [4, 14, 24, 18, 18, 24, 8, 12, 16, 28, 22, 18].map(wch => ({ wch }));
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
      head: [["#", "Emp ID", "Name", "Division", "Department", "Designation", "Grade", "Status"]],
      body: filtered.map((e, i) => [
        i + 1, e.employeeId, e.personName, e.division || e.company || "—",
        e.department || "—", e.designation || "—", e.grade || "—",
        STATUS[e.status]?.label || "Active",
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
    const gradeHint = loadActiveGrades().map(g => g.grade).join(", ") || "Add grades in the Grades tab (A, B, C...)";
    const headers = ["Person Name", "Employee ID", "Division", "Department", "Designation", "Grade", "Team", "Role", "Reporting Manager", "Work Location", "Joining Date", "Status", "Phone", "Email", "Gender", "Marital Status", "Nationality", "Address"];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ["Rahul Sharma", "BITL-001", "Engineering", "Civil", "Site Engineer", "C", "Site Team A", "Civil Engineer", "Ravi Kumar", "Gurgaon", "2024-01-01", "Active", "9876543210", "rahul@company.com", "Male", "Single", "Indian", "New Delhi"],
      [],
      [`Valid grades: ${gradeHint}  (A=entry ascending)`, "Valid status: Active / Inactive / On Leave"],
    ]);
    ws["!cols"] = headers.map(h => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employees_template.xlsx");
  };

  /* ── Bulk Import ── */
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
          company:       String(r["Division"]           || r["company"]     || "").trim(),
          department:    String(r["Department"]         || "").trim(),
          designation:   String(r["Designation"]        || "").trim(),
          grade:         String(r["Grade"]              || "").trim().toUpperCase().charAt(0),
          team:          String(r["Team"]               || "").trim(),
          role:          String(r["Role"]               || "").trim(),
          reportingTo:   String(r["Reporting Manager"]  || "").trim(),
          workLocation:  String(r["Work Location"]      || "").trim(),
          joiningDate:   String(r["Joining Date"]       || "").trim(),
          status:        String(r["Status"]             || "active").toLowerCase().includes("inactive") ? "inactive" : String(r["Status"] || "").toLowerCase().includes("leave") ? "on_leave" : "active",
          contactNumber: String(r["Phone"]              || "").trim(),
          email:         String(r["Email"]              || "").trim(),
          gender:        String(r["Gender"]             || "").trim(),
          maritalStatus: String(r["Marital Status"]     || "").trim(),
          nationality:   String(r["Nationality"]        || "").trim(),
          address:       String(r["Address"]            || "").trim(),
          createdById:   u.id || "", createdByName: u.name || "Bulk Import",
        }))
        .filter(r => r.personName);

      if (!rows.length) { alert("No valid rows found. Make sure 'Person Name' column exists."); return; }

      let imported = 0, failed = 0;
      for (const row of rows) {
        const res = await fetch(`${API}/api/procurement/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        if (res.ok) imported++; else failed++;
      }
      await fetchEmps();
      alert(`${imported} employee(s) imported${failed ? `, ${failed} failed` : ""}.`);
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
          onBack={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => handleDelete(selected.id)}
        />
        {modal && (
          <EmpModal form={form} setForm={setForm} editId={editId} saving={saving}
            onClose={() => setModal(false)} onSave={handleSave} divisions={divisions} allEmps={emps} />
        )}
        {toast && (
          <div className={`fixed top-5 right-5 z-[200] px-4 py-3 rounded-lg text-sm font-medium shadow-lg border
            ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
            {toast.msg}
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
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
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

      {/* Filters row */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
        {/* Search — left, fixed width */}
        <div className="relative w-52">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search employees…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>

        {/* Filters — pushed to right */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <select value={filterDiv} onChange={e => { setFilterDiv(e.target.value); setPage(1); }}
              className="pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer">
              <option value="">All Divisions</option>
              {allDivs.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1); }}
              className="pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer">
              <option value="">All Departments</option>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none cursor-pointer">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={20} className="text-blue-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-300">
          <Users size={32} />
          <p className="text-sm">{search || filterDiv || filterDept || filterStatus ? "No employees match your filters" : "No employees yet — add one above"}</p>
        </div>
      ) : view === "card" ? (

        /* ── CARD VIEW ── */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {paginated.map(emp => {
            const div = emp.division || emp.company || "";
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
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th style={{ width: 110, minWidth: 110, left: 0 }} className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap sticky z-[30]">Contact ID</th>
                  <th style={{ minWidth: 180, left: 110 }} className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap sticky z-[30]">Name</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Emp ID</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Division</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Department</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap">Designation</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Grade</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap text-center">Status</th>
                  <th className="px-4 py-3 font-semibold bg-slate-50 border-b border-l border-slate-200 whitespace-nowrap text-center sticky right-0 z-[30]">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((emp) => {
                  const div = emp.division || emp.company || "";
                  const td = "px-4 py-3 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";
                  const logTitle = [
                    emp.createdByName ? `Added by: ${emp.createdByName}` : "",
                    emp.createdAt ? `On: ${new Date(emp.createdAt).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}` : "",
                  ].filter(Boolean).join("\n") || "No log available";
                  return (
                    <tr key={emp.id} className="group cursor-pointer" onClick={() => setSelected(emp)}>
                      <td style={{ width: 110, minWidth: 110, left: 0 }} className="px-4 py-3 border-b border-r border-slate-200 font-mono text-xs text-slate-500 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky z-[20]">{emp.contactCode || "—"}</td>
                      <td style={{ minWidth: 180, left: 110 }} className="px-4 py-3 border-b border-r border-slate-200 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky z-[20]">
                        <span className="font-semibold text-slate-800 text-[13px]">{emp.personName}</span>
                      </td>
                      <td className={`${td} font-mono text-xs`}>{emp.employeeId || "—"}</td>
                      <td className={td}>{div || "—"}</td>
                      <td className={td}>{emp.department || "—"}</td>
                      <td className={td}>{emp.designation || "—"}</td>
                      <td className={`${td} text-center`}><GradeBadge grade={emp.grade} /></td>
                      <td className={`${td} text-center`}><StatusBadge status={emp.status} /></td>
                      <td className="px-4 py-3 border-b border-l border-slate-200 text-center whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors sticky right-0 z-[20]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(emp)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit"><Edit2 size={13} /></button>
                          <button className="p-1.5 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title={logTitle}><Clock size={13} /></button>
                          <button onClick={() => handleDelete(emp.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Rows per page:</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="text-[11px] border border-slate-200 rounded px-2 py-1 text-slate-600 bg-white focus:outline-none">
                {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
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
          onClose={() => setModal(false)} onSave={handleSave} divisions={divisions} allEmps={emps} />
      )}
    </>
  );
}
