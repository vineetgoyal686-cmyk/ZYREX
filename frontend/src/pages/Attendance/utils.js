// ═══════════════════════════════════════════════════════════
// ATTENDANCE UTILITIES — v3 FIXED (COMPLETE FILE)
// ═══════════════════════════════════════════════════════════

// Staff shift: 9:30 AM - 6:00 PM
const SHIFT = {
  Day:   { start: 9.5/24, end: 18/24, grace: 15/(24*60) },
  Night: { start: 20/24,  end: 8/24,  grace: 15/(24*60) },
};
// Guard shift: 8:00 AM - 8:00 PM (Day) / 8:00 PM - 8:00 AM (Night)
const GUARD_SHIFT = {
  Day:   { start: 8/24,  end: 20/24, grace: 15/(24*60) },
  Night: { start: 20/24, end: 8/24,  grace: 15/(24*60) },
};

export const ALL_STATUSES = ["Present","Absent","Annual Leave","Comp Off","Holiday","On Duty","Week Off"];
const PRESENT_LIST = ["present","on duty"];
const LEAVE_LIST = ["annual leave","comp off","holiday","week off"];
export const isPresent = (s) => PRESENT_LIST.includes(s?.toLowerCase());
const isAbsent = (s) => s?.toLowerCase() === "absent";
const isLeaveStatus = (s) => LEAVE_LIST.includes(s?.toLowerCase());

// ─── Date utilities ─────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MON_MAP = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

// Pass-through: Supabase returns ISO "2026-04-05", legacy Excel returns serial number
export const excelToJSDate = (serial) => {
  if (!serial) return "";
  if (typeof serial === "string") return serial.trim();
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  return `${String(d.getUTCDate()).padStart(2,"0")}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
};

// Parse both ISO "2026-04-05" and legacy "21-Dec-24" formats
const parseDateStr = (s) => {
  if (!s) return null;
  // ISO format: "2026-04-05"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  // Legacy "DD-Mon-YY"
  const p = s.split("-");
  if (p.length !== 3) return null;
  const day = parseInt(p[0]), mon = MON_MAP[p[1]], yr = parseInt(p[2]);
  if (isNaN(day) || mon === undefined) return null;
  return new Date(yr < 100 ? 2000+yr : yr, mon, day);
};

export const formatDate = (s) => {
  if (!s) return "-";
  // ISO "2026-04-05" → "05-Apr-26"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) {
    const [y, m, d] = s.trim().split("-");
    return `${d}-${MONTHS[parseInt(m,10)-1]}-${y.slice(-2)}`;
  }
  return s;
};

// Export parseDateStr so AttendanceTable can use it for date range filtering
export { parseDateStr };

// ─── Is Today — robust: strips time component, handles ISO + legacy ─
export const isToday = (dateStr) => {
  if (!dateStr) return false;
  // Strip time/timezone component if present (e.g. "2026-04-07T00:00:00+00:00" → "2026-04-07")
  const clean = String(dateStr).trim().split("T")[0].split(" ")[0];
  const d = parseDateStr(clean);
  if (!d) return false;
  const t = new Date();
  return d.getFullYear() === t.getFullYear() &&
         d.getMonth()    === t.getMonth()    &&
         d.getDate()     === t.getDate();
};

// ─── Format time → "9:30 AM" ─────────────────────────────
// Handles: HH:MM 24hr (Supabase), Excel decimal (legacy), "H:MM AM/PM"
export const formatTime = (val) => {
  if (val === null || val === undefined || val === "") return "-";
  if (typeof val === "string") {
    // HH:MM 24hr (new format from Supabase)
    const hm = val.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      let h = parseInt(hm[1]); const m = parseInt(hm[2]);
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${h}:${String(m).padStart(2,"0")} ${ampm}`;
    }
    return val.includes("AM") || val.includes("PM") ? val : "-";
  }
  if (typeof val !== "number" || val === 0) return "-";
  // Excel decimal (legacy)
  const totalMins = Math.round(val * 24 * 60);
  let h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,"0")} ${ampm}`;
};

// ─── Time → decimal fraction of day ─────────────────────
// Handles: HH:MM 24hr, "H:MM AM/PM", Excel decimal number
const toDecimal = (val) => {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // HH:MM 24hr (Supabase format)
    const hm = val.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      const h = parseInt(hm[1]), m = parseInt(hm[2]);
      return (h * 60 + m) / 1440;
    }
    // H:MM AM/PM (legacy)
    const ampm = val.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!ampm) return null;
    let h = parseInt(ampm[1]); const mn = parseInt(ampm[2]);
    if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    return (h + mn/60) / 24;
  }
  return null;
};

// ─── Late Detection ──────────────────────────────────────
const getShiftDef = (r) => {
  const map = r.type === "guard" ? GUARD_SHIFT : SHIFT;
  return map[r.shift] || map.Day;
};

export const isLate = (r) => {
  if (!r.inTime || !isPresent(r.status)) return false;
  const t = toDecimal(r.inTime);
  if (t === null) return false;
  const sh = getShiftDef(r);
  return t > (sh.start + sh.grace);
};

export const getLateMinutes = (r) => {
  if (!isLate(r)) return 0;
  const t = toDecimal(r.inTime);
  const sh = getShiftDef(r);
  return Math.round((t - sh.start) * 24 * 60);
};

export const formatLateDuration = (r) => {
  const m = getLateMinutes(r);
  if (m <= 0) return "";
  return Math.floor(m/60) > 0 ? `Late ${Math.floor(m/60)}h ${m%60}m` : `Late ${m}m`;
};

// ─── OT Detection ────────────────────────────────────────
export const getOTMinutes = (r) => {
  if (!r.outTime || !isPresent(r.status)) return 0;
  const t = toDecimal(r.outTime);
  if (t === null || t === 0) return 0;
  const sh = getShiftDef(r);
  if (r.shift === "Night") {
    // Night shift ends early morning (e.g. 8 AM = 8/24)
    if (t > 0 && t < 0.5 && t > sh.end) return Math.round((t - sh.end) * 24 * 60);
    return 0;
  }
  return t > sh.end ? Math.round((t - sh.end) * 24 * 60) : 0;
};

export const formatOTDuration = (r) => {
  const m = getOTMinutes(r);
  if (m <= 0) return "-";
  return Math.floor(m/60) > 0 ? (m%60 > 0 ? `${Math.floor(m/60)}h ${m%60}m` : `${Math.floor(m/60)}h`) : `${m}m`;
};

// ─── Working Hours ───────────────────────────────────────
export const getWorkingHours = (r) => {
  if (r.workingHrs && typeof r.workingHrs === "string" && r.workingHrs !== "0Hrs 0Min" && r.workingHrs !== "") return r.workingHrs;
  if (!r.inTime || !r.outTime || !isPresent(r.status)) return "-";
  const inD = toDecimal(r.inTime), outD = toDecimal(r.outTime);
  if (inD === null || outD === null || inD === 0 || outD === 0) return "-";
  let diff = outD - inD;
  if (diff < 0) diff += 1;
  const mins = Math.round(diff * 24 * 60);
  return `${Math.floor(mins/60)}h ${mins%60}m`;
};

// ─── Display Status ──────────────────────────────────────
export const getDisplayStatus = (r) => r.status || "-";

export const getStatusBadgeClass = (ds) => {
  const s = ds?.toLowerCase();
  if (s === "present" || s === "on duty") return "badge-success";
  if (s === "absent") return "badge-danger";
  if (s === "late") return "badge-warning";
  return "badge-info";
};

// ─── Statistics ──────────────────────────────────────────
export const calcStats = (records) => {
  const total = records.length;
  const present = records.filter(r => isPresent(r.status) && !isLate(r)).length;
  const absent = records.filter(r => isAbsent(r.status)).length;
  const late = records.filter(r => isPresent(r.status) && isLate(r)).length;
  const onLeave = records.filter(r => isLeaveStatus(r.status)).length;
  const totalCame = present + late;
  const attendancePct = total > 0 ? Math.round((totalCame / total) * 100) : 0;
  return { total, present, absent, late, onLeave, attendancePct };
};

export const calcAvgWorkingHours = (records) => {
  const recs = records.filter(r => r.inTime && r.outTime && isPresent(r.status));
  if (!recs.length) return "0h 0m";
  let tot = 0;
  recs.forEach(r => {
    const i = toDecimal(r.inTime), o = toDecimal(r.outTime);
    if (i !== null && o !== null && i > 0 && o > 0) { let d = o - i; if (d < 0) d += 1; tot += d * 24 * 60; }
  });
  const avg = Math.round(tot / recs.length);
  return `${Math.floor(avg/60)}h ${avg%60}m`;
};

// ─── Consecutive Absent (last 7 days only) ───────────────
export const findConsecutiveAbsent = (records) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentRecords = records.filter(r => {
    const d = parseDateStr(r.date);
    return d && d >= weekAgo && d <= now;
  });
  const byName = {};
  recentRecords.forEach(r => { if (!byName[r.name]) byName[r.name] = []; byName[r.name].push(r); });
  const results = [];
  Object.entries(byName).forEach(([name, recs]) => {
    recs.sort((a, b) => (parseDateStr(b.date)||0) - (parseDateStr(a.date)||0));
    let c = 0;
    for (const r of recs) { if (isAbsent(r.status)) c++; else break; }
    if (c >= 2) results.push({ name, designation: recs[0].designation, department: recs[0].department, days: c });
  });
  return results;
};

// ─── Late Today (for Today tab) ──────────────────────────
export const findLateToday = (todayRecords) => {
  return todayRecords
    .filter(r => isPresent(r.status) && isLate(r))
    .map(r => ({
      name: r.name,
      designation: r.designation,
      department: r.department,
      lateBy: formatLateDuration(r),
      inTime: formatTime(r.inTime),
      type: r.type,
    }));
};

// ─── Habitual Late (for Staff/Guard tabs — current month) ─
export const findHabitualLate = (records, threshold = 5) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthRecords = records.filter(r => {
    const d = parseDateStr(r.date);
    return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const byName = {};
  monthRecords.forEach(r => {
    if (isPresent(r.status) && isLate(r)) {
      if (!byName[r.name]) byName[r.name] = { count: 0, designation: r.designation, department: r.department };
      byName[r.name].count++;
    }
  });
  return Object.entries(byName).filter(([,v]) => v.count >= threshold).map(([name, v]) => ({ name, ...v }));
};

// ─── OT Today ────────────────────────────────────────────
export const calcOTToday = (recs) => {
  return recs.filter(r => getOTMinutes(r) > 0).map(r => {
    const m = getOTMinutes(r);
    return { name: r.name, designation: r.designation, department: r.department, shift: r.shift, ot: `${Math.floor(m/60)}h ${m%60}m` };
  });
};

// ─── Charts ──────────────────────────────────────────────
export const calcWeeklyAttendance = (records) => {
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const dm = {}; days.forEach(d => dm[d] = { total: 0, present: 0 });
  records.forEach(r => {
    const d = parseDateStr(r.date);
    if (!d) return;
    const dn = d.toLocaleDateString("en-US", { weekday: "short" }).slice(0,3);
    if (dm[dn]) { dm[dn].total++; if (isPresent(r.status)) dm[dn].present++; }
  });
  return days.map(d => ({ day: d, pct: dm[d].total > 0 ? Math.round((dm[d].present / dm[d].total) * 100) : 0 }));
};

export const getTopPerformers = (records, limit = 5) => {
  const byName = {};
  records.forEach(r => {
    if (!byName[r.name]) byName[r.name] = { total: 0, present: 0, designation: r.designation, department: r.department };
    byName[r.name].total++; if (isPresent(r.status)) byName[r.name].present++;
  });
  return Object.entries(byName)
    .map(([name, v]) => ({ name, designation: v.designation, department: v.department, pct: v.total > 0 ? Math.round((v.present/v.total)*100) : 0, initials: name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) }))
    .sort((a, b) => b.pct - a.pct).slice(0, limit);
};

export const getDepartmentSplit = (records) => {
  const dm = {};
  records.forEach(r => {
    const dept = r.department || "Other";
    if (!dm[dept]) dm[dept] = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
    dm[dept].total++;
    if (isAbsent(r.status)) dm[dept].absent++;
    else if (isLeaveStatus(r.status)) dm[dept].leave++;
    else if (isPresent(r.status)) { if (isLate(r)) dm[dept].late++; else dm[dept].present++; }
  });
  return Object.entries(dm).map(([dept, v]) => ({ dept: dept.length > 18 ? dept.slice(0,18)+"…" : dept, ...v }));
};

export const getShiftSplit = (records) => {
  const s = { Day: { present: 0, total: 0 }, Night: { present: 0, total: 0 } };
  records.forEach(r => {
    const sh = r.shift || "Day";
    if (!s[sh]) s[sh] = { present: 0, total: 0 };
    s[sh].total++; if (isPresent(r.status)) s[sh].present++;
  });
  return Object.entries(s).filter(([,v]) => v.total > 0).map(([shift, v]) => ({ shift, ...v }));
};

// ─── Export CSV (Excel) ──────────────────────────────────
export const exportToExcel = (data, filename) => {
  if (!data?.length) { alert("No data to export"); return; }
  const keys = Object.keys(data[0]).filter(k => !["id","type","_displayStatus","workingHrs","otHrs"].includes(k));
  let csv = "\uFEFF" + keys.join(",") + "\n";
  data.forEach(row => {
    csv += keys.map(k => {
      let v = row[k] ?? "";
      if (typeof v === "number" && (k === "inTime" || k === "outTime")) v = formatTime(v);
      if (typeof v === "string" && v.includes(",")) v = `"${v}"`;
      return v;
    }).join(",") + "\n";
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ─── Export PDF (actual .pdf download using jsPDF) ───────
export const exportToPDF = (data, filename) => {
  if (!data?.length) { alert("No data to export"); return; }

  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(filename, 14, 18);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text("Attendance Report", 14, 24);
      doc.text(`Generated: ${new Date().toLocaleString()}  |  Total Records: ${data.length}`, 14, 30);

      // Blue line
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.8);
      doc.line(14, 33, 283, 33);

      // Table
      const keys = Object.keys(data[0]).filter(k => !["id","type","_displayStatus","workingHrs","otHrs"].includes(k));
      const headers = keys.map(k => k.replace(/([A-Z])/g, " $1").trim().toUpperCase());

      const rows = data.map(row => keys.map(k => {
        let v = row[k];
        if (v === null || v === undefined) return "-";
        if (typeof v === "number" && (k === "inTime" || k === "outTime")) return formatTime(v);
        return String(v) || "-";
      }));

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 37,
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 3,
          font: "helvetica",
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 14, right: 14 },
      });

      // Footer on every page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Generated by BMS Monitoring System", 14, doc.internal.pageSize.height - 10);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 35, doc.internal.pageSize.height - 10);
      }

      // Download as .pdf
      doc.save(`${filename}.pdf`);
    });
  }).catch((err) => {
    console.error("PDF export error:", err);
    alert("PDF library not found. Please run:\nnpm install jspdf jspdf-autotable");
  });
};
