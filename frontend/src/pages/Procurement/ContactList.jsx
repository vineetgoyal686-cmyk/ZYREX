import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  Plus, Search, Pencil, Trash2, X, Users, Download, Upload,
  FileSpreadsheet, FileText, ChevronDown, Phone, Mail,
  Building2, UserCheck, MapPin, Calendar, BadgeCheck,
  Camera, ChevronLeft, ChevronRight, Briefcase,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 12;

const emptyForm = {
  personName: "", contactNumber: "", designation: "", company: "",
  email: "", department: "", reportingTo: "", status: "active",
  workLocation: "", role: "", team: "", bio: "", tags: "", employeeId: "",
  dateOfBirth: "", gender: "", maritalStatus: "", nationality: "",
  alternatePhone: "", address: "", joiningDate: "",
};

const CONTACT_TEMPLATE_HEADERS = [
  "Person Name", "Phone Number", "Designation", "Company", "Work Email",
  "Department", "Reporting To", "Status", "Work Location", "Role", "Team",
  "Employee ID", "Joining Date", "Date of Birth", "Gender", "Marital Status",
  "Nationality", "Alternate Phone", "Address", "Tags", "Bio",
];

const normalizeImportKey = (value) =>
  String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const excelDateToInput = (value) => {
  if (!value) return "";
  const format = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  if (value instanceof Date) return format(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return format(new Date(text));
};

const normalizeImportStatus = (value) => {
  const status = normalizeImportKey(value);
  if (!status) return "active";
  if (["inactive", "deactive", "deactivated"].includes(status)) return "inactive";
  if (["onleave", "leave", "on_leave"].includes(status)) return "on_leave";
  return "active";
};

const mapContactImportRow = (row) => {
  const normalized = Object.entries(row || {}).reduce((acc, [key, value]) => {
    acc[normalizeImportKey(key)] = value;
    return acc;
  }, {});
  const readRaw = (...aliases) => {
    for (const alias of aliases) {
      const value = normalized[normalizeImportKey(alias)];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  };
  const read = (...aliases) => String(readRaw(...aliases)).trim();

  return {
    personName: read("Person Name", "Full Name", "Name"),
    contactNumber: read("Phone Number", "Contact Number", "Phone", "Mobile"),
    designation: read("Designation", "Job Title"),
    company: read("Company", "Company / Organisation", "Organisation", "Organization"),
    email: read("Work Email", "Email", "Official Email"),
    department: read("Department"),
    reportingTo: read("Reporting To", "Reporting Manager", "Manager"),
    status: normalizeImportStatus(read("Status")),
    workLocation: read("Work Location", "Location"),
    role: read("Role"),
    team: read("Team"),
    employeeId: read("Employee ID", "Emp ID", "Employee Code"),
    joiningDate: excelDateToInput(readRaw("Joining Date", "Date of Joining")),
    dateOfBirth: excelDateToInput(readRaw("Date of Birth", "DOB")),
    gender: read("Gender"),
    maritalStatus: read("Marital Status"),
    nationality: read("Nationality"),
    alternatePhone: read("Alternate Phone", "Alternate Number"),
    address: read("Address"),
    tags: read("Tags"),
    bio: read("Bio", "About"),
  };
};

const PALETTE = [
  ["#4f46e5","#818cf8"], ["#0ea5e9","#38bdf8"], ["#10b981","#34d399"],
  ["#f59e0b","#fbbf24"], ["#ef4444","#f87171"], ["#8b5cf6","#a78bfa"],
  ["#ec4899","#f472b6"], ["#06b6d4","#22d3ee"], ["#84cc16","#a3e635"],
  ["#f97316","#fb923c"],
];
const avatarGrad = (name) => {
  const [from, to] = PALETTE[(name?.charCodeAt(0) || 65) % PALETTE.length];
  return { background: `linear-gradient(135deg, ${from}, ${to})`, color: "#fff" };
};

const TAG_COLORS = [
  "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700", "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

const STATUS = {
  active:   { label: "Active",   bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  inactive: { label: "Inactive", bg: "bg-red-50",      text: "text-red-500",     dot: "bg-red-400",    bar: "bg-red-400"     },
  on_leave: { label: "On Leave", bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400",  bar: "bg-amber-400"   },
};

const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

const Avatar = ({ name, size = "md", imgUrl }) => {
  const cls = { xl: "w-[72px] h-[72px] text-2xl", lg: "w-14 h-14 text-xl", md: "w-10 h-10 text-sm", sm: "w-8 h-8 text-xs" }[size];
  if (imgUrl)
    return <div className={`${cls} rounded-full overflow-hidden shrink-0`}><img src={imgUrl} alt={name} className="w-full h-full object-cover" /></div>;
  return (
    <div className={`${cls} rounded-full flex items-center justify-center shrink-0 font-bold`} style={avatarGrad(name)}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
};

const Field = ({ label, children, value, onChange, placeholder, type = "text" }) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">{label}</label>
    {children || (
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none
          focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/50 text-slate-700 transition-all placeholder:text-slate-400" />
    )}
  </div>
);

const SelectField = ({ label, value, onChange, children }) => (
  <Field label={label}>
    <div className="relative group">
      <select value={value} onChange={onChange}
        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none
          focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/50 text-slate-700 appearance-none pr-10 transition-all cursor-pointer">
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
    </div>
  </Field>
);

/* Info row used inside section cards */
const InfoRow = ({ label, value, className = "" }) => (
  <div className={`min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 ${className}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    <p
      title={value || ""}
      className={`mt-1.5 break-words text-[13px] leading-5 ${value ? "text-slate-950 font-semibold" : "text-slate-400 italic"}`}
    >
      {value || "—"}
    </p>
  </div>
);

const AddressBlock = ({ value }) => (
  <InfoRow label="Address" value={value || "No address added"} className="col-span-2" />
);

const TABS = ["Overview", "Activity", "Documents", "Notes", "Permissions"];

/* ═══════════════════════════════════════════
   CONTACT DETAIL — right panel
═══════════════════════════════════════════ */
function ContactDetail({ contact, profileImageUrl, onEdit, onDelete, onImageClick, uploadingImage, canEdit, canDelete }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [showImageModal, setShowImageModal] = useState(false);
  const tags = contact.tags ? contact.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const s = STATUS[contact.status || "active"];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 shrink-0">
        {/* Thin status color stripe at top */}
        <div className={`h-1 ${s.bar}`} />

        <div className="px-8 py-5 flex items-center gap-6">
          <div className="relative shrink-0">
            <div className="w-[72px] h-[72px] rounded-full overflow-hidden ring-4 ring-white shadow-md border border-slate-100 cursor-pointer hover:ring-indigo-300 transition-all"
              onClick={() => profileImageUrl && setShowImageModal(true)}>
              {profileImageUrl
                ? <img src={profileImageUrl} alt={contact.personName} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold"
                    style={avatarGrad(contact.personName)}>
                    {contact.personName?.[0]?.toUpperCase() || "?"}
                  </div>
                )
              }
            </div>
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-0.5 flex-wrap">
              <h2 className="text-xl font-bold text-slate-800 leading-tight">{contact.personName}</h2>
              <StatusBadge status={contact.status || "active"} />
            </div>
            {contact.designation && (
              <p className="text-sm text-slate-500 font-medium">{contact.designation}</p>
            )}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {contact.department && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Briefcase size={10} className="shrink-0" /> {contact.department}
                </span>
              )}
              {contact.company && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Building2 size={10} className="shrink-0" /> {contact.company}
                </span>
              )}
              {contact.contactCode && (
                <code className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold tracking-wider">
                  {contact.contactCode}
                </code>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                  text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                <Pencil size={13} /> Edit
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400
                  hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat bar — 4 non-repeating key facts ── */}
      <div className="bg-white border-b border-slate-100 px-8 py-4 shrink-0">
        <div className="grid grid-cols-4 divide-x divide-slate-100">
          {[
            { Icon: BadgeCheck, label: "Employee ID",       value: contact.employeeId  },
            { Icon: Calendar,   label: "Joining Date",      value: contact.joiningDate ? new Date(contact.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "" },
            { Icon: UserCheck,  label: "Reporting Manager", value: contact.reportingTo },
            { Icon: MapPin,     label: "Work Location",     value: contact.workLocation},
          ].map(({ Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-5 first:pl-0 last:pr-0">
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider truncate">{label}</p>
                <p className={`text-sm font-semibold truncate ${value ? "text-slate-700" : "text-slate-300"}`}>
                  {value || "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white border-b border-slate-100 px-8 shrink-0">
        <div className="flex items-center">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6">
        {activeTab === "Overview" ? (
          <div className="space-y-4">

            {/* 3-column section cards */}
            <div className="grid grid-cols-[1.18fr_1.12fr_1.14fr] gap-4">

              {/* Personal Information — unique fields not shown elsewhere */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 bg-white">
                  <div className="w-1 h-4 rounded-full bg-indigo-500" />
                  <h3 className="text-[14px] font-bold text-slate-900">Personal Information</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 px-4 py-4">
                  <InfoRow label="Full Name"      value={contact.personName} className="col-span-2" />
                  <InfoRow label="Date of Birth"  value={contact.dateOfBirth ? new Date(contact.dateOfBirth).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""} />
                  <InfoRow label="Gender"         value={contact.gender} />
                  <InfoRow label="Marital Status" value={contact.maritalStatus} />
                  <InfoRow label="Nationality"    value={contact.nationality} />
                </div>
              </div>

              {/* Contact Information — email & phone live HERE only */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 bg-white">
                  <div className="w-1 h-4 rounded-full bg-sky-500" />
                  <h3 className="text-[14px] font-bold text-slate-900">Contact Information</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 px-4 py-4">
                  <InfoRow label="Email" value={contact.email} className="col-span-2" />
                  <InfoRow label="Phone (Primary)" value={contact.contactNumber} />
                  <InfoRow label="Phone (Alternate)" value={contact.alternatePhone} />
                  <AddressBlock value={contact.address} />
                </div>
              </div>

              {/* Organization Information */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 bg-white">
                  <div className="w-1 h-4 rounded-full bg-violet-500" />
                  <h3 className="text-[14px] font-bold text-slate-900">Organization Information</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 px-4 py-4">
                  <InfoRow label="Department"  value={contact.department} />
                  <InfoRow label="Designation" value={contact.designation} className="col-span-2" />
                  <InfoRow label="Role"        value={contact.role} />
                  <InfoRow label="Team"        value={contact.team} />
                  <InfoRow label="Company"     value={contact.company} className="col-span-2" />
                </div>
              </div>
            </div>

            {/* About / Bio + Tags */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-emerald-500" />
                  <h3 className="text-[13px] font-bold text-slate-700">About / Bio</h3>
                </div>
                <div className="px-5 py-4">
                  {contact.bio
                    ? <p className="text-[13px] text-slate-600 leading-relaxed">{contact.bio}</p>
                    : <p className="text-[13px] text-slate-300 italic">No bio added yet.</p>}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-amber-500" />
                  <h3 className="text-[13px] font-bold text-slate-700">Tags</h3>
                </div>
                <div className="px-5 py-4">
                  {tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, i) => (
                        <span key={tag}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${TAG_COLORS[i % TAG_COLORS.length]}`}>
                          {tag}
                        </span>
                      ))}
                      <button className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:bg-slate-50 text-sm leading-none">+</button>
                    </div>
                  ) : (
                    <p className="text-[13px] text-slate-300 italic">No tags added.</p>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-slate-300 text-sm italic">
            {activeTab} — coming soon
          </div>
        )}
      </div>

      {/* ═════ IMAGE LIGHTBOX MODAL ═════ */}
      {showImageModal && profileImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowImageModal(false)}>
          <div className="relative max-w-2xl max-h-[80vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img src={profileImageUrl} alt={contact.personName} className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain" />
            <button onClick={() => setShowImageModal(false)}
              className="absolute -top-10 right-0 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
              <X size={20} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════ */
export default function ContactList() {
  const [contacts, setContacts]               = useState([]);
  const [companies, setCompanies]             = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [showModal, setShowModal]             = useState(false);
  const [form, setForm]                       = useState(emptyForm);
  const [editId, setEditId]                   = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [search, setSearch]                   = useState("");
  const [saving, setSaving]                   = useState(false);
  const [toast, setToast]                     = useState(null);
  const [page, setPage]                       = useState(1);
  const [showExportMenu, setShowExportMenu]   = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  const [uploadingImage, setUploadingImage]   = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);
  const [contactImgUrls, setContactImgUrls]   = useState({});
  const [tempImageFile, setTempImageFile]     = useState(null);
  const [tempPreviewUrl, setTempPreviewUrl]   = useState(null);

  const exportMenuRef = useRef();
  const imageInputRef = useRef();
  const importInputRef = useRef();
  const { canAdd, canEdit, canDelete, canExport } = useModulePermissions("contact_list");

  useEffect(() => {
    fetchContacts();
    fetch(`${API}/api/procurement/companies`)
      .then(r => r.json()).then(d => setCompanies(d.companies || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* Batch-sign profile images for all contacts in the list */
  useEffect(() => {
    const withImg = contacts.filter(c => c.profileImage);
    if (!withImg.length) return;
    fetch(`${API}/api/procurement/sign-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "picture", paths: withImg.map(c => c.profileImage) }),
    })
      .then(r => r.json())
      .then(d => {
        const map = {};
        withImg.forEach(c => { const u = d.urls?.[c.profileImage]; if (u) map[c.id] = u; });
        setContactImgUrls(map);
      })
      .catch(() => {});
  }, [contacts]);

  /* Sign profile image URL when selected contact changes */
  useEffect(() => {
    setProfileImageUrl(null);
    if (!selectedContact?.profileImage) return;
    fetch(`${API}/api/procurement/sign-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "picture", paths: [selectedContact.profileImage] }),
    })
      .then(r => r.json())
      .then(d => { const url = d.urls?.[selectedContact.profileImage]; if (url) setProfileImageUrl(url); })
      .catch(() => {});
  }, [selectedContact?.id, selectedContact?.profileImage]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/procurement/contacts`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch {
      setContacts([]);
      showToast("Failed to load contacts", "error");
    }
    setLoading(false);
  };

  const showToast = (msg, type = "success", duration = 6000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), duration);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditId(null);
    setTempImageFile(null);
    setTempPreviewUrl(null);
    setShowModal(true);
  };
  const openEdit = (c) => {
    setForm({
      personName: c.personName || "", contactNumber: c.contactNumber || "",
      designation: c.designation || "", company: c.company || "",
      email: c.email || "", department: c.department || "",
      reportingTo: c.reportingTo || "", status: c.status || "active",
      workLocation: c.workLocation || "", role: c.role || "",
      team: c.team || "", bio: c.bio || "", tags: c.tags || "",
      employeeId: c.employeeId || "",
      dateOfBirth: c.dateOfBirth || "", gender: c.gender || "",
      maritalStatus: c.maritalStatus || "", nationality: c.nationality || "",
      alternatePhone: c.alternatePhone || "",
      address: c.address || "", joiningDate: c.joiningDate || "",
    });
    setEditId(c.id);
    setTempImageFile(null);
    setTempPreviewUrl(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.personName.trim()) return showToast("Person Name required", "error");
    if (!form.employeeId.trim()) return showToast("Employee ID required", "error");
    setSaving(true);
    try {
      const url    = editId ? `${API}/api/procurement/contacts/${editId}` : `${API}/api/procurement/contacts`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, createdById: u.id || "", createdByName: u.name || "" }),
      });
      const saveResult = await res.json();
      if (!saveResult.success) throw new Error(saveResult.error);

      const contactId = editId || saveResult.id;

      // Handle delayed image upload if a file was selected in the form
      if (tempImageFile && contactId) {
        const fd = new FormData();
        fd.append("image", tempImageFile);
        const imgRes = await fetch(`${API}/api/procurement/contacts/${contactId}/profile-image`, { method: "POST", body: fd });
        const imgData = await imgRes.json();
        if (imgData.success) {
          setContactImgUrls(prev => ({ ...prev, [contactId]: tempPreviewUrl }));
        }
      }

      showToast(editId ? "Contact updated" : "Contact added");
      setShowModal(false);
      setTempImageFile(null);
      setTempPreviewUrl(null);

      if (editId) {
        setContacts(prev => prev.map(c => c.id === editId ? { ...c, ...form } : c));
        if (selectedContact?.id === editId) setSelectedContact(prev => ({ ...prev, ...form }));
      } else {
        fetchContacts();
      }
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this contact?")) return;
    try {
      await fetch(`${API}/api/procurement/contacts/${id}`, { method: "DELETE" });
      showToast("Contact deleted");
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedContact?.id === id) setSelectedContact(null);
    } catch { showToast("Failed to delete", "error"); }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    
    // If modal is open, we just store the file and preview locally
    if (showModal) {
      setTempImageFile(file);
      setTempPreviewUrl(previewUrl);
      return;
    }

    const targetId = selectedContact?.id;
    if (!targetId) return;
    
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API}/api/procurement/contacts/${targetId}/profile-image`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setContactImgUrls(prev => ({ ...prev, [targetId]: `${previewUrl}?t=${Date.now()}` }));
        setContacts(prev => prev.map(c => c.id === targetId ? { ...c, profileImage: data.path } : c));
        if (selectedContact?.id === targetId) {
          setProfileImageUrl(previewUrl);
          setSelectedContact(prev => ({ ...prev, profileImage: data.path }));
        }
        showToast("Profile photo updated");
      }
    } catch { showToast("Failed to upload photo", "error"); }
    setUploadingImage(false);
    e.target.value = "";
  };

  const handleDeleteImage = async (id) => {
    if (!id || !confirm("Remove profile photo?")) return;
    try {
      const res = await fetch(`${API}/api/procurement/contacts/${id}/profile-image`, { method: "DELETE" });
      if (res.ok) {
        setContactImgUrls(prev => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
        if (selectedContact?.id === id) {
          setProfileImageUrl(null);
          setSelectedContact(prev => ({ ...prev, profileImage: null }));
        }
        setContacts(prev => prev.map(c => c.id === id ? { ...c, profileImage: null } : c));
        showToast("Profile photo removed");
      }
    } catch { showToast("Failed to remove photo", "error"); }
  };

  const exportExcel = () => {
    const data = filtered.map((c, i) => ({
      "#": i + 1,
      "Contact ID": c.contactCode,
      "Employee ID": c.employeeId,
      "Person Name": c.personName,
      "Phone": c.contactNumber,
      "Alternate Phone": c.alternatePhone,
      "Email": c.email,
      "Designation": c.designation,
      "Department": c.department,
      "Reporting To": c.reportingTo,
      "Company": c.company,
      "Work Location": c.workLocation,
      "Role": c.role,
      "Team": c.team,
      "Joining Date": c.joiningDate,
      "Date of Birth": c.dateOfBirth,
      "Gender": c.gender,
      "Marital Status": c.maritalStatus,
      "Nationality": c.nationality,
      "Address": c.address,
      "Status": c.status,
      "Tags": c.tags,
      "Bio": c.bio,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, "contact_list.xlsx");
    setShowExportMenu(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Contact List — Procurement Setup", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length} contacts  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Contact ID", "Person Name", "Phone", "Email", "Designation", "Department", "Company", "Status"]],
      body: filtered.map((c, i) => [
        i + 1, c.contactCode, c.personName, c.contactNumber || "—",
        c.email || "—", c.designation || "—", c.department || "—",
        c.company || "—", STATUS[c.status]?.label || "Active",
      ]),
      styles: { fontSize: 7.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.text("BMS — Contact List", 14, doc.internal.pageSize.getHeight() - 8);
      },
    });
    doc.save("contact_list.pdf");
    setShowExportMenu(false);
  };

  const downloadImportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([CONTACT_TEMPLATE_HEADERS]);
    ws["!cols"] = CONTACT_TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, "contact_import_template.xlsx");
    setShowExportMenu(false);
  };

  const handleContactImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowExportMenu(false);
    setImportingContacts(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No sheet found");

      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
      const allRows = rawRows.map(mapContactImportRow).filter(r => r.personName);
      if (!allRows.length) {
        showToast("No valid contact rows found", "error");
        return;
      }

      // Dedup within the file itself (by employee_id if present)
      const seenKeys = new Set();
      const rows = allRows.filter(r => {
        const key = r.employeeId?.trim() || null;
        if (!key) return true; // no employee_id → always allow
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      let imported = 0;
      let duplicates = 0;
      let failed = 0;

      for (const row of rows) {
        const res = await fetch(`${API}/api/procurement/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...row, createdById: u.id || "", createdByName: u.name || "Bulk Import" }),
        });
        if (res.status === 409) duplicates += 1;
        else if (res.ok) imported += 1;
        else failed += 1;
      }

      await fetchContacts();
      const parts = [];
      if (imported)   parts.push(`${imported} imported`);
      if (duplicates) parts.push(`${duplicates} skipped (already exist)`);
      if (failed)     parts.push(`${failed} failed`);
      showToast(parts.join(", "), failed ? "error" : "success");
    } catch (err) {
      console.error("Contact import error:", err);
      showToast("Failed to import Excel file", "error");
    } finally {
      setImportingContacts(false);
      e.target.value = "";
    }
  };

  const filtered = contacts.filter(c =>
    [c.contactCode, c.personName, c.contactNumber, c.designation, c.company, c.department, c.employeeId]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="flex h-[calc(100vh-56px)] -mt-4 -mx-6 -mb-4 overflow-hidden">

      {/* Import overlay — prevents accidental refresh/navigation */}
      {importingContacts && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Importing contacts…</p>
            <p className="text-slate-400 text-xs">Please do not refresh or close this page</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input type="file" ref={importInputRef} accept=".xlsx,.xls" className="hidden" onChange={handleContactImport} />

      {/* ═══════════ LEFT PANEL ═══════════ */}
      <div className="w-[320px] shrink-0 bg-white border-r border-slate-200 flex flex-col">

        {/* Header */}
        <div className="relative overflow-visible px-5 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400" />
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center">
                <h2 className="text-[18px] font-bold leading-tight text-slate-900">Contacts</h2>
              </div>
              <p className="mt-1 max-w-[165px] text-[12px] leading-4 text-slate-500">Manage organisation contacts</p>
            </div>
            {canAdd && (
              <button onClick={openAdd}
                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-[12px] font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700">
                <Plus size={13} /> Add Contact
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search contact..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 shadow-sm outline-none transition-colors placeholder:text-slate-400
                  focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
            </div>
            {(canExport || canAdd) && (
              <div className="relative" ref={exportMenuRef}>
                <button onClick={() => setShowExportMenu(v => !v)} disabled={importingContacts}
                  title="Import / Export contacts"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60">
                  <Download size={14} />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-100 bg-white p-2 shadow-xl z-30">
                    {canExport && (
                      <>
                        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Export</p>
                        <button onClick={exportExcel}
                          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors text-left">
                          <FileSpreadsheet size={14} /> Excel (.xlsx)
                        </button>
                        <button onClick={exportPDF}
                          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left">
                          <FileText size={14} /> PDF
                        </button>
                      </>
                    )}
                    {canExport && canAdd && <div className="my-2 border-t border-slate-100" />}
                    {canAdd && (
                      <>
                        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Import</p>
                        <button onClick={downloadImportTemplate}
                          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left">
                          <Download size={14} /> Download Template
                        </button>
                        <button onClick={() => { setShowExportMenu(false); importInputRef.current?.click(); }}
                          disabled={importingContacts}
                          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors text-left disabled:opacity-60">
                          <Upload size={14} /> Upload Excel File
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section label */}
        <div className="px-5 pt-3 pb-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            All Contacts ({filtered.length})
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Users size={28} className="text-slate-200" />
              <p className="text-slate-300 text-xs">No contacts found</p>
            </div>
          ) : (
            paginated.map(c => {
              const isSelected = selectedContact?.id === c.id;
              const cs = STATUS[c.status || "active"];
              return (
                <button key={c.id} onClick={() => setSelectedContact(c)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-slate-50
                    border-l-[3px] transition-all
                    ${isSelected ? "bg-indigo-50/60 border-l-indigo-500" : "hover:bg-slate-50 border-l-transparent"}`}>
                  <Avatar name={c.personName} size="md" imgUrl={contactImgUrls[c.id] || null} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-[13px] truncate leading-tight ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>
                      {c.personName}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {[c.designation, c.department].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />
                    <span className={`text-[10px] font-semibold ${cs.text}`}>{cs.label}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-3 bg-white shrink-0">
          <p className="text-[10px] text-slate-400 mb-2">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} contacts
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors">
                <ChevronLeft size={13} />
              </button>
              {(() => {
                let start = Math.max(1, Math.min(page - 2, totalPages - 4));
                let end   = Math.min(totalPages, start + 4);
                return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded-lg text-[11px] font-medium border transition-all
                      ${page === n ? "bg-slate-800 text-white border-slate-800" : "text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                    {n}
                  </button>
                ));
              })()}
              {totalPages > 5 && page < totalPages - 2 && (
                <>
                  <span className="text-slate-300 text-xs px-0.5">···</span>
                  <button onClick={() => setPage(totalPages)}
                    className="w-7 h-7 rounded-lg text-[11px] font-medium border border-slate-200 text-slate-500 hover:bg-slate-50">
                    {totalPages}
                  </button>
                </>
              )}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors">
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        {selectedContact ? (
          <ContactDetail
            key={selectedContact.id}
            contact={selectedContact}
            profileImageUrl={profileImageUrl}
            onEdit={() => openEdit(selectedContact)}
            onDelete={() => handleDelete(selectedContact.id)}
            onImageClick={() => imageInputRef.current?.click()}
            uploadingImage={uploadingImage}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Users size={26} className="text-slate-300" />
            </div>
            <div>
              <p className="text-slate-600 font-semibold">Select a contact</p>
              <p className="text-slate-400 text-sm mt-1">Click any contact from the list to view their profile</p>
            </div>
            {canAdd && (
              <button onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white
                  text-sm font-medium hover:bg-indigo-700 transition-colors mt-1 shadow-sm">
                <Plus size={14} /> Add Contact
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════ ADD / EDIT MODAL ═══════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col border border-white/20">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="relative group/avatar">
                  <Avatar 
                    name={form.personName || "C"} 
                    size="lg" 
                    imgUrl={tempPreviewUrl || (editId ? contactImgUrls[editId] : null)} 
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center gap-1.5 z-10">
                    <button type="button" onClick={() => imageInputRef.current?.click()} className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors" title="Change Photo">
                      <Camera size={14} />
                    </button>
                    {(tempPreviewUrl || (editId && contactImgUrls[editId])) && (
                      <button 
                        type="button"
                        onClick={() => {
                          if (tempImageFile) {
                            setTempImageFile(null);
                            setTempPreviewUrl(null);
                          } else if (editId) {
                            handleDeleteImage(editId);
                          }
                        }} 
                        className="p-1.5 bg-rose-500/40 hover:bg-rose-500/60 rounded-full text-white transition-colors" 
                        title="Delete Photo"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 leading-tight">{editId ? "Update Contact Profile" : "Create New Contact"}</h2>
                  <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">{editId ? `ID: ${form.contactCode || "..."}` : "Initial Setup"}</p>
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setTempImageFile(null); setTempPreviewUrl(null); }}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-6 space-y-8 overflow-y-auto flex-1 bg-white">

              {/* Row 1: Identity & Professional */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Core Identity (2/3 width) */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-indigo-600 mb-1">
                      <UserCheck size={14} className="opacity-70" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Primary Identity</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Field label="Full Name *" value={form.personName}
                          onChange={e => setForm(f => ({ ...f, personName: e.target.value }))}
                          placeholder="e.g. John Smith" />
                      </div>
                      <Field label="Employee ID *" value={form.employeeId}
                        onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                        placeholder="e.g. EMP-001" />
                      <SelectField label="Current Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="on_leave">On Leave</option>
                      </SelectField>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sky-600 mb-1">
                      <Briefcase size={14} className="opacity-70" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Organizational Details</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <SelectField label="Company / Organisation" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}>
                          <option value="">— Select Company —</option>
                          {companies.map(c => <option key={c.id} value={c.companyName}>{c.companyName}</option>)}
                        </SelectField>
                      </div>
                      <Field label="Department" value={form.department}
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                        placeholder="e.g. Accounts" />
                      <Field label="Designation" value={form.designation}
                        onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                        placeholder="e.g. Team Lead" />
                      <Field label="Role / Specialization" value={form.role}
                        onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                        placeholder="e.g. Site Engineer" />
                      <Field label="Team" value={form.team}
                        onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                        placeholder="e.g. Civil Team" />
                    </div>
                  </div>
                </div>

                {/* Right Column: Key Dates & Metrics (1/3 width) */}
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Calendar size={14} className="opacity-70" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Key Dates</span>
                    </div>
                    <Field label="Joining Date" value={form.joiningDate} type="date"
                      onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} />
                    <Field label="Date of Birth" value={form.dateOfBirth} type="date"
                      onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                  </div>
                  
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <MapPin size={14} className="opacity-70" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Assignment</span>
                    </div>
                    <Field label="Reporting Manager" value={form.reportingTo}
                      onChange={e => setForm(f => ({ ...f, reportingTo: e.target.value }))}
                      placeholder="e.g. Reporting Manager Name" />
                    <Field label="Work Location" value={form.workLocation}
                      onChange={e => setForm(f => ({ ...f, workLocation: e.target.value }))}
                      placeholder="e.g. Delhi Office" />
                  </div>
                </div>

              </div>

              {/* Row 2: Contact Info (Horizontal Split) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1">
                    <Mail size={14} className="opacity-70" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Communication</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Primary Phone" value={form.contactNumber} type="tel"
                      onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))}
                      placeholder="e.g. 9876543210" />
                    <Field label="Alternate Phone" value={form.alternatePhone} type="tel"
                      onChange={e => setForm(f => ({ ...f, alternatePhone: e.target.value }))}
                      placeholder="Optional" />
                    <div className="md:col-span-2">
                      <Field label="Work Email Address" value={form.email} type="email"
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. name@company.com" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <MapPin size={14} className="opacity-70" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Residential Address</span>
                  </div>
                  <textarea value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Full residential or mailing address..."
                    rows={4}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none
                      focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 text-slate-700 resize-none transition-all leading-relaxed" />
                </div>
              </div>

              {/* Row 3: Personal & Background */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-2">
                <div className="lg:col-span-1 space-y-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <BadgeCheck size={14} className="opacity-70" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Personal Profile</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <SelectField label="Gender" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="">— Select —</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </SelectField>
                    <SelectField label="Marital Status" value={form.maritalStatus} onChange={e => setForm(f => ({ ...f, maritalStatus: e.target.value }))}>
                      <option value="">— Select —</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                    </SelectField>
                    <Field label="Nationality" value={form.nationality}
                      onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                      placeholder="e.g. Indian" />
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <FileText size={14} className="opacity-70" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Bio & Meta Tags</span>
                  </div>
                  <div className="space-y-4">
                    <Field label="Discovery Tags (comma separated)" value={form.tags}
                      onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                      placeholder="e.g. VIP, Procurement, Technical" />
                    <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      placeholder="Notes or brief biography about this contact..." rows={3}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none
                        focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 text-slate-700 resize-none transition-all leading-relaxed" />
                  </div>
                </div>
              </div>

            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm">
                {saving ? "Saving…" : editId ? "Update Contact" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
