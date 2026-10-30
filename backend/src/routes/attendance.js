const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { projectScope, allows, userIdFrom } = require("../helpers/projectScope");
const { requirePerm, hasPerm } = require("../helpers/permHelper");

/*
 * Attendance for a project or an office ("place"). People come from HRMS
 * Employees (sql/employee_category_posting.sql): everyone posted at the
 * place, plus anyone already marked there that day (sent from elsewhere).
 * Rows keep the place's code in project_id (e.g. "B47", office "HO-GU");
 * guards go to guard_attendance, everyone else to attendance.
 * One person, one row per day — across all places.
 */

const att = (table) => supabase.schema("attendance").from(table);
const emps = () => supabase.schema("organisation").from("employees");
// Labour isn't on attendance — only employees (staff, guards, drivers, cooks)
const NOT_ON_ATTENDANCE = ["Labour"];
const onAttendance = (e) => !NOT_ON_ATTENDANCE.includes(e?.category);
const tableFor = (category) => category === "Guard" ? "guard_attendance" : "attendance";
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST
const norm = (v) => String(v || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

const STATUSES = ["Present", "Absent", "Annual Leave", "Comp Off", "Holiday", "On Duty", "Week Off", "Half Day"];

/* ── Places: active projects + offices, with their company ── */
let _places = null, _placesAt = 0;
const allPlaces = async () => {
  if (_places && Date.now() - _placesAt < 60e3) return _places;
  const [p, b] = await Promise.all([
    supabase.from("projects").select("id, company_id, project_code, project_name, city, state, is_active").order("project_name"),
    supabase.schema("organisation").from("branches").select("id, company_id, code, label, city, state, status").order("label"),
  ]);
  if (p.error) throw p.error;
  if (b.error) throw b.error;
  _places = [
    ...(p.data || []).filter(r => r.is_active !== false && r.project_code).map(r => ({
      id: r.id, kind: "project", code: r.project_code, name: r.project_name || r.project_code,
      companyId: r.company_id, detail: [r.city, r.state].filter(Boolean).join(", "),
    })),
    ...(b.data || []).filter(r => String(r.status || "active").toLowerCase() === "active" && r.code).map(r => ({
      id: r.id, kind: "office", code: r.code, name: r.label || r.code,
      companyId: r.company_id, detail: [r.city, r.state].filter(Boolean).join(", "),
    })),
  ];
  _placesAt = Date.now();
  return _places;
};
const placeByCode = async (code) => (await allPlaces()).find(p => norm(p.code) === norm(code)) || null;

// Every :place in the URL is checked against the user's Attendance access
router.param("place", async (req, res, next, code) => {
  try {
    const place = await placeByCode(code);
    if (!place) return res.status(404).json({ error: `No project or office with code "${code}"` });
    if (!allows(await projectScope(userIdFrom(req), "staff_attendance"), place.id, place.code))
      return res.status(403).json({ error: "This project/office isn't in your Attendance access" });
    req.place = place;
    next();
  } catch (err) { next(err); }
});

/* ── Hours: "HH:MM" in/out → minutes worked; night shift may cross midnight ── */
// accepts "09:30" and old rows' "8:00 PM"
const toMin = (t) => {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(String(t || ""));
  if (!m) return null;
  let h = Number(m[1]) % 24;
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  return h * 60 + Number(m[2]);
};
const hhmm = (t) => {
  const m = toMin(t);
  return m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const workedMin = (inT, outT) => {
  const a = toMin(inT), b = toMin(outT);
  if (a == null || b == null) return 0;
  return b > a ? b - a : b < a ? b + 1440 - a : 0;
};

const companiesList = async () => {
  const { data, error } = await supabase.schema("organisation").from("companies")
    .select("id, company_code, company_name, status").order("company_name");
  if (error) throw error;
  return (data || []).filter(c => String(c.status || "active").toLowerCase() === "active")
    .map(c => ({ id: c.id, code: c.company_code || "", name: c.company_name || "" }));
};

const through = (e, agencies) => e.employed_through === "agency" ? (agencies.get(e.agency_vendor_id) || "Agency") : "Direct";
const agencyMap = async (list) => {
  const ids = [...new Set(list.map(e => e.agency_vendor_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await supabase.schema("procurement").from("vendors").select("id, vendor_name").in("id", ids);
  return new Map((data || []).map(v => [v.id, v.vendor_name || ""]));
};

const rowOut = (r, table) => ({
  id: r.id, table, date: r.date, status: r.status || "", inTime: hhmm(r.in_time), outTime: hhmm(r.out_time),
  shift: r.shift || "Day", remarks: r.remarks || "", markedBy: r.created_by_name || "",
  minutes: workedMin(r.in_time, r.out_time),
});

/* ═══ GET /api/attendance/places — companies, and the projects / offices
   this user may take attendance for ═══ */
router.get("/places", requirePerm("staff_attendance", "can_view"), async (req, res) => {
  try {
    const scope = await projectScope(userIdFrom(req), "staff_attendance");
    const [companies, places] = await Promise.all([companiesList(), allPlaces()]);
    const mine = places.filter(p => p.companyId && allows(scope, p.id, p.code));
    res.json({
      companies: companies.filter(c => mine.some(p => p.companyId === c.id)),
      places: mine,
    });
  } catch (err) {
    console.error("Attendance places error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ GET /api/attendance/register/:place?date= — the day's register ═══ */
router.get("/register/:place", requirePerm("staff_attendance", "can_view"), async (req, res) => {
  try {
    const place = req.place;
    const date = isoDate(req.query.date) || today();

    // rows marked here today, and the people they belong to
    const [here1, here2, posted] = await Promise.all([
      att("attendance").select("*").eq("date", date).ilike("project_id", place.code),
      att("guard_attendance").select("*").eq("date", date).ilike("project_id", place.code),
      emps().select("*").eq("posted_kind", place.kind).eq("posted_id", place.id).neq("status", "inactive"),
    ]);
    for (const r of [here1, here2, posted]) if (r.error) throw r.error;
    const hereRows = [...here1.data.map(r => ({ r, table: "attendance" })), ...here2.data.map(r => ({ r, table: "guard_attendance" }))];

    const people = new Map((posted.data || []).filter(onAttendance).map(e => [e.id, e]));
    const visitorIds = hereRows.map(x => x.r.employee_id).filter(id => id && !people.has(id));
    if (visitorIds.length) {
      const { data } = await emps().select("*").in("id", [...new Set(visitorIds)]);
      (data || []).filter(onAttendance).forEach(e => people.set(e.id, e));
    }

    // same people marked somewhere else that day
    const ids = [...people.keys()];
    const elsewhere = new Map();
    if (ids.length) {
      const [o1, o2] = await Promise.all([
        att("attendance").select("employee_id, project_id, status").eq("date", date).in("employee_id", ids).not("project_id", "ilike", place.code),
        att("guard_attendance").select("employee_id, project_id, status").eq("date", date).in("employee_id", ids).not("project_id", "ilike", place.code),
      ]);
      [...(o1.data || []), ...(o2.data || [])].forEach(r => elsewhere.set(r.employee_id, { place: r.project_id, status: r.status }));
    }

    const agencies = await agencyMap([...people.values()]);
    const byEmp = new Map(hereRows.filter(x => x.r.employee_id).map(x => [x.r.employee_id, x]));
    const list = [...people.values()].map(e => {
      const rec = byEmp.get(e.id);
      return {
        employeeId: e.id, contactCode: e.contact_code || "", name: e.person_name || "", category: e.category || "",
        designation: e.designation || "", mobile: e.contact_number || "", through: through(e, agencies),
        visiting: !(e.posted_kind === place.kind && e.posted_id === place.id),
        record: rec ? rowOut(rec.r, rec.table) : null,
        elsewhere: elsewhere.get(e.id) || null,
      };
    }).sort((a, b) => (a.category === "Guard") - (b.category === "Guard") || a.name.localeCompare(b.name));

    // rows here that point at no employee (old data not linked yet)
    const orphans = hereRows.filter(x => !x.r.employee_id).map(x => ({ name: x.r.name, ...rowOut(x.r, x.table) }));

    res.json({ place, date, people: list, orphans });
  } catch (err) {
    console.error("Attendance register error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ POST /api/attendance/mark/:place — save the day's changes
   body { date, rows: [{ employeeId, status, inTime, outTime, shift, remarks }] }
   status "" clears that person's mark here ═══ */
router.post("/mark/:place", async (req, res) => {
  try {
    const uid = userIdFrom(req);
    const [canAdd, canEdit, canDelete] = await Promise.all([
      hasPerm(uid, "staff_attendance", "can_add"), hasPerm(uid, "staff_attendance", "can_edit"), hasPerm(uid, "staff_attendance", "can_delete"),
    ]);
    if (!canAdd && !canEdit) return res.status(403).json({ error: "You can't mark attendance" });

    const place = req.place;
    const date = isoDate(req.body.date);
    if (!date) return res.status(400).json({ error: "Date is required" });
    if (date > today()) return res.status(400).json({ error: "Can't mark attendance for a future date" });
    const rows = (Array.isArray(req.body.rows) ? req.body.rows : []).filter(r => r?.employeeId);
    if (!rows.length) return res.status(400).json({ error: "Nothing to save" });

    const { data: people, error: pe } = await emps().select("id, person_name, category, designation, department")
      .in("id", rows.map(r => r.employeeId));
    if (pe) throw pe;
    const byId = new Map((people || []).map(e => [e.id, e]));
    const ids = [...byId.keys()];
    const [x1, x2] = await Promise.all([
      att("attendance").select("id, employee_id, project_id, status, in_time, out_time, shift, remarks").eq("date", date).in("employee_id", ids),
      att("guard_attendance").select("id, employee_id, project_id, status, in_time, out_time, shift, remarks").eq("date", date).in("employee_id", ids),
    ]);
    const existing = new Map();
    (x1.data || []).forEach(r => existing.set(r.employee_id, { ...r, table: "attendance" }));
    (x2.data || []).forEach(r => existing.set(r.employee_id, { ...r, table: "guard_attendance" }));

    const user = req.body.createdByName || "";
    // edit history per person per day — GET /api/audit-logs/attendance/<employeeId>_<date>
    const logs = [];
    const LOG_FIELDS = [["status", "Status"], ["shift", "Shift"], ["in_time", "In"], ["out_time", "Out"], ["remarks", "Remarks"]];
    const log = (e, action, before, after) => {
      const changes = LOG_FIELDS
        .map(([k, label]) => ({ field: label, from: k.endsWith("_time") ? hhmm(before?.[k]) : (before?.[k] || ""), to: after?.[k] || "" }))
        .filter(c => c.from !== c.to);
      if (action === "Updated" && !changes.length) return;
      logs.push({ entity_type: "attendance", entity_id: `${e.id}_${date}`, entity_name: `${e.person_name} · ${date} · ${place.code}`,
        action, user_id: uid || null, user_name: user || null, changes });
    };
    let saved = 0;
    const skipped = [];
    for (const r of rows) {
      const e = byId.get(r.employeeId);
      if (!e) { skipped.push({ name: r.employeeId, reason: "Employee not found" }); continue; }
      if (!onAttendance(e)) { skipped.push({ name: e.person_name, reason: `${e.category} isn't on attendance` }); continue; }
      const cur = existing.get(e.id);
      if (cur && norm(cur.project_id) !== norm(place.code)) {
        skipped.push({ name: e.person_name, reason: `Already marked at ${cur.project_id}` }); continue;
      }
      const status = String(r.status || "");
      if (!status) {
        if (!cur) continue;
        if (!canDelete) { skipped.push({ name: e.person_name, reason: "You can't remove a mark" }); continue; }
        const { error } = await att(cur.table).delete().eq("id", cur.id);
        if (error) throw error;
        log(e, "Removed", cur, null);
        saved++; continue;
      }
      if (!STATUSES.includes(status)) { skipped.push({ name: e.person_name, reason: `Unknown status "${status}"` }); continue; }
      if (cur ? !canEdit : !canAdd) { skipped.push({ name: e.person_name, reason: cur ? "You can't edit a mark" : "You can't add a mark" }); continue; }

      const table = tableFor(e.category);
      const common = {
        date, status, name: e.person_name || "", employee_id: e.id, site_code: place.code,
        in_time: hhmm(r.inTime), out_time: hhmm(r.outTime), shift: r.shift === "Night" ? "Night" : "Day",
        remarks: String(r.remarks || "").slice(0, 300),
      };
      const fields = table === "guard_attendance"
        ? { ...common, type: e.designation || "Security Guard", location: "" }
        : { ...common, designation: e.designation || "", department: e.department || "" };

      // moved category (e.g. staff → guard): the row changes table
      if (cur && cur.table !== table) {
        await att(cur.table).delete().eq("id", cur.id);
      }
      const { error } = cur && cur.table === table
        ? await att(table).update(fields).eq("id", cur.id)
        : await att(table).insert({ ...fields, project_id: place.code, created_by_id: uid || null, created_by_name: user });
      if (error) throw error;
      log(e, cur ? "Updated" : "Marked", cur, fields);
      saved++;
    }
    if (logs.length) {
      const { error } = await supabase.schema("procurement").from("audit_logs").insert(logs);
      if (error) console.error("Attendance log write error:", error.message);
    }
    res.json({ success: true, saved, skipped });
  } catch (err) {
    console.error("Attendance mark error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ GET /api/attendance/people/:place — everyone active in the place's
   company: "Add Attendance", Bulk Upload matching, Monthly Sheet rows ═══ */
router.get("/people/:place", requirePerm("staff_attendance", "can_view"), async (req, res) => {
  try {
    const { data, error } = await emps().select("id, person_name, category, designation, contact_number, contact_code, employee_id, posted_kind, posted_id")
      .eq("company_id", req.place.companyId).neq("status", "inactive").order("person_name");
    if (error) throw error;
    const places = await allPlaces();
    res.json({
      people: (data || []).filter(onAttendance).map(e => ({
        employeeId: e.id, name: e.person_name || "", category: e.category || "", designation: e.designation || "",
        mobile: e.contact_number || "", contactCode: e.contact_code || "", empCode: e.employee_id || "",
        postedAt: places.find(p => p.id === e.posted_id)?.code || "",
      })),
    });
  } catch (err) {
    console.error("Attendance people error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ GET /api/attendance/records/:place?from=&to= — every mark in a range ═══ */
router.get("/records/:place", requirePerm("staff_attendance", "can_view"), async (req, res) => {
  try {
    const place = req.place;
    const to = isoDate(req.query.to) || today();
    const from = isoDate(req.query.from) || `${to.slice(0, 8)}01`;
    const fetchAll = async (table) => {
      let out = [], i = 0;
      for (;;) {
        const { data, error } = await att(table).select("*").ilike("project_id", place.code)
          .gte("date", from).lte("date", to).order("date", { ascending: false }).range(i, i + 999);
        if (error) throw error;
        out = out.concat(data || []);
        if (!data || data.length < 1000) return out;
        i += 1000;
      }
    };
    const [a, g] = await Promise.all([fetchAll("attendance"), fetchAll("guard_attendance")]);
    const ids = [...new Set([...a, ...g].map(r => r.employee_id).filter(Boolean))];
    const people = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await emps().select("id, person_name, category, designation, contact_code").in("id", ids.slice(i, i + 200));
      (data || []).forEach(e => people.set(e.id, e));
    }
    const out = [...a.map(r => [r, "attendance"]), ...g.map(r => [r, "guard_attendance"])].map(([r, table]) => {
      const e = people.get(r.employee_id);
      return {
        ...rowOut(r, table), employeeId: r.employee_id || "", name: e?.person_name || r.name || "",
        category: e?.category || (table === "guard_attendance" ? "Guard" : ""),
        designation: e?.designation || r.designation || r.type || "", contactCode: e?.contact_code || "",
      };
    }).filter(r => !NOT_ON_ATTENDANCE.includes(r.category))
      .sort((x, y) => y.date.localeCompare(x.date) || x.name.localeCompare(y.name));
    res.json({ place, from, to, records: out });
  } catch (err) {
    console.error("Attendance records error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ DELETE /api/attendance/records/:place/:table/:id — one mark, only
   when it belongs to this place ═══ */
router.delete("/records/:place/:table/:id", requirePerm("staff_attendance", "can_delete"), async (req, res) => {
  try {
    const { table, id } = req.params;
    if (!["attendance", "guard_attendance"].includes(table)) return res.status(400).json({ error: "Unknown table" });
    const { data, error } = await att(table).delete().eq("id", id).ilike("project_id", req.place.code)
      .select("id, employee_id, date, name, status, shift, in_time, out_time, remarks");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Record not found at this place" });
    const r = data[0];
    if (r.employee_id) {
      await supabase.schema("procurement").from("audit_logs").insert({
        entity_type: "attendance", entity_id: `${r.employee_id}_${r.date}`, entity_name: `${r.name} · ${r.date} · ${req.place.code}`,
        action: "Removed", user_id: userIdFrom(req) || null, user_name: req.query.by || null,
        changes: [{ field: "Status", from: r.status || "", to: "" }],
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Attendance delete error:", err.message);
    res.status(500).json({ error: "Delete failed", detail: err.message });
  }
});

module.exports = router;
