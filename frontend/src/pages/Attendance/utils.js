// Attendance helpers shared by the Daily Register and Records.

// Status chips — short key, full name (as saved), colour
export const STATUSES = [
  { v: "Present",      k: "P",  title: "Present",      on: "bg-emerald-600 text-white border-emerald-600", soft: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { v: "Absent",       k: "A",  title: "Absent",       on: "bg-red-600 text-white border-red-600",         soft: "bg-red-50 text-red-700 border-red-200" },
  { v: "Half Day",     k: "HD", title: "Half day",     on: "bg-amber-500 text-white border-amber-500",     soft: "bg-amber-50 text-amber-700 border-amber-200" },
  { v: "Annual Leave", k: "L",  title: "Leave",        on: "bg-blue-600 text-white border-blue-600",       soft: "bg-blue-50 text-blue-700 border-blue-200" },
  { v: "Week Off",     k: "WO", title: "Week off",     on: "bg-slate-600 text-white border-slate-600",     soft: "bg-slate-100 text-slate-600 border-slate-200" },
  { v: "Holiday",      k: "H",  title: "Holiday",      on: "bg-slate-600 text-white border-slate-600",     soft: "bg-slate-100 text-slate-600 border-slate-200" },
  { v: "On Duty",      k: "OD", title: "On duty (outside)", on: "bg-violet-600 text-white border-violet-600", soft: "bg-violet-50 text-violet-700 border-violet-200" },
  { v: "Comp Off",     k: "CO", title: "Comp off",     on: "bg-cyan-600 text-white border-cyan-600",       soft: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];
export const statusOf = (v) => STATUSES.find(s => s.v === v);
export const isPresent = (v) => v === "Present" || v === "On Duty" || v === "Half Day";
export const isLeave = (v) => ["Annual Leave", "Week Off", "Holiday", "Comp Off"].includes(v);

// Shift timings until each project / office gets its own (planned):
// staff 9:30–18:00, guards 08:00–20:00, night 20:00–08:00; 15 min grace
export const SHIFTS = {
  staff: { Day: { start: 9 * 60 + 30, len: 8 * 60 + 30 }, Night: { start: 20 * 60, len: 12 * 60 } },
  guard: { Day: { start: 8 * 60,      len: 12 * 60 },     Night: { start: 20 * 60, len: 12 * 60 } },
};
export const GRACE = 15;
const shiftFor = (category, shift) => SHIFTS[category === "Guard" ? "guard" : "staff"][shift === "Night" ? "Night" : "Day"];

export const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// minutes between in and out; a night shift may cross midnight
export const workedMin = (inT, outT) => {
  const a = toMin(inT), b = toMin(outT);
  if (a == null || b == null) return 0;
  return b > a ? b - a : b < a ? b + 1440 - a : 0;
};
export const otMin = (category, shift, inT, outT) => Math.max(0, workedMin(inT, outT) - shiftFor(category, shift).len);
// minutes late (0 = on time); only for someone present with an in-time
export const lateMin = (category, shift, status, inT) => {
  if (!isPresent(status)) return 0;
  const a = toMin(inT);
  if (a == null) return 0;
  const { start } = shiftFor(category, shift);
  let d = a - start;
  if (d < -720) d += 1440; // night shift, came in after midnight
  return d > GRACE ? d : 0;
};

export const fmtDur = (m) => m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "—";
export const fmtTime = (t) => {
  const m = toMin(t);
  if (m == null) return "—";
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return `${h % 12 || 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};

// dates as "YYYY-MM-DD" in local time
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// "Fri 30 Oct 2026" — no commas
export const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", opts).replace(/,/g, "") : "—";

export const CATEGORY_DOT = {
  "Office Staff": "bg-blue-500", "Site Staff": "bg-teal-500", "Guard": "bg-slate-500",
  "Labour": "bg-amber-500", "Driver": "bg-violet-500", "Cook": "bg-rose-500",
};

export const currentUserName = () => {
  try { return JSON.parse(localStorage.getItem("bms_user") || "{}").name || ""; } catch { return ""; }
};

/* ── Reading an uploaded sheet (Bulk Upload) ── */
// "P", "present", "Leave", "WO" … → the saved status; "" if unknown
export const parseStatus = (v) => {
  const s = String(v ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";
  const alias = { leave: "Annual Leave", l: "Annual Leave", al: "Annual Leave", halfday: "Half Day", weekoff: "Week Off", onduty: "On Duty", compoff: "Comp Off" };
  if (alias[s]) return alias[s];
  const hit = STATUSES.find(x => x.k.toLowerCase() === s || x.v.toLowerCase().replace(/[^a-z]/g, "") === s);
  return hit ? hit.v : "";
};
// "9:30", "09:30 AM", Excel time (0.3958…) or a Date → "HH:MM"; "" if blank/bad
export const parseTime = (v) => {
  if (v == null || v === "") return "";
  let m = null;
  if (v instanceof Date) m = v.getHours() * 60 + v.getMinutes();
  else if (typeof v === "number") m = Math.round((v % 1) * 1440) % 1440;
  else {
    const x = /^\s*(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?\s*$/i.exec(String(v));
    if (!x) return null;
    let h = Number(x[1]);
    if (x[3]) h = (h % 12) + (x[3].toLowerCase() === "pm" ? 12 : 0);
    if (h > 23 || Number(x[2]) > 59) return null;
    m = h * 60 + Number(x[2]);
  }
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
// "2026-10-30", "30-10-2026", "30/10/2026", Excel date number or Date → "YYYY-MM-DD"; null if bad
export const parseDate = (v) => {
  const iso = (y, mo, d) => {
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
      ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  };
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 864e5)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  const s = String(v ?? "").trim();
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (x) return iso(+x[1], +x[2], +x[3]);
  x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  return x ? iso(+x[3], +x[2], +x[1]) : null;
};

// days counted for pay in the Monthly Sheet: present / on duty / paid off = 1, half day = ½
export const PAID_FULL = ["Present", "On Duty", "Annual Leave", "Week Off", "Holiday", "Comp Off"];
export const paidValue = (v) => v === "Half Day" ? 0.5 : PAID_FULL.includes(v) ? 1 : 0;
