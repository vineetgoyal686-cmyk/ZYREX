const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase  = require("../helpers/supabaseHelper");
const { projectScope, allows, userIdFrom } = require("../helpers/projectScope");

const upload = multer({ storage: multer.memoryStorage() });

// Attendance tab's project access: every route carries the project (its
// code, e.g. B47) in the URL — checked once here (helpers/projectScope.js)
router.param("projectId", async (req, res, next, projectId) => {
  try {
    if (allows(await projectScope(userIdFrom(req), "staff_attendance"), projectId)) return next();
    res.status(403).json({ error: "This project isn't in your Attendance access" });
  } catch (err) { next(err); }
});

/* ─── Working hours calculator (HH:MM format) ─── */
const calcWorkingHours = (inTime, outTime) => {
  if (!inTime || !outTime) return { workingHrs: "0Hrs 0Min", otHrs: "0Hrs 0Min" };
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  if (isNaN(ih) || isNaN(im) || isNaN(oh) || isNaN(om)) return { workingHrs: "0Hrs 0Min", otHrs: "0Hrs 0Min" };
  const inMin  = ih * 60 + im;
  const outMin = oh * 60 + om;
  if (outMin <= inMin) return { workingHrs: "0Hrs 0Min", otHrs: "0Hrs 0Min" };
  const total = outMin - inMin;
  const ot    = Math.max(0, total - 480);
  const fmt   = (m) => `${Math.floor(m / 60)}Hrs ${m % 60}Min`;
  return { workingHrs: fmt(total), otHrs: fmt(ot) };
};

/* ── Backend cache (60s TTL per project) ── */
const _cache = {};
const CACHE_TTL = 60 * 1000;

const getCached = (key) => {
  const entry = _cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
};
const setCache = (key, data) => { _cache[key] = { data, ts: Date.now() }; };
const clearCache = (projectId) => { delete _cache[projectId]; };

/* ── Fetch all rows bypassing PostgREST 1000-row max_rows limit ── */
const TABLES_WITH_DATE = ["attendance", "guard_attendance"];
const TABLE_SCHEMA = {
  attendance:       "attendance",
  guard_attendance: "attendance",
  staff_contacts:   "attendance",
  guard_contacts:   "attendance",
};
const schemaFrom = (table) => {
  const schema = TABLE_SCHEMA[table];
  return schema ? supabase.schema(schema).from(table) : supabase.from(table);
};

const fetchAll = async (table, filters = {}) => {
  const PAGE = 1000;
  let all = [], from = 0;
  while (true) {
    let q = schemaFrom(table).select("*");
    if (TABLES_WITH_DATE.includes(table)) q = q.order("date", { ascending: true });
    else q = q.order("created_at", { ascending: true });
    q = q.range(from, from + PAGE - 1);
    Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
};

/* ═══════════════════════════════════
   GET /api/attendance/read/:projectId
═══════════════════════════════════ */
router.get("/read/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const cached = getCached(projectId);
    if (cached) return res.json(cached);

    const [staffData, guardsData, scData, gcData] = await Promise.all([
      fetchAll("attendance",      { project_id: projectId }),
      fetchAll("guard_attendance",{ project_id: projectId }),
      fetchAll("staff_contacts",  { project_id: projectId }),
      fetchAll("guard_contacts",  { project_id: projectId }),
    ]);

    const staffRes   = { data: staffData };
    const guardsRes  = { data: guardsData };
    const scRes      = { data: scData };
    const gcRes      = { data: gcData };

    const staff = (staffRes.data || []).map(r => {
      const { workingHrs, otHrs } = calcWorkingHours(r.in_time, r.out_time);
      return {
        id:          r.id,
        date:        r.date        || "",
        siteCode:    r.site_code   || "",
        name:        r.name        || "",
        designation: r.designation || "",
        department:  r.department  || "",
        status:      r.status      || "",
        inTime:      r.in_time     || "",
        outTime:     r.out_time    || "",
        shift:       r.shift       || "Day",
        workingHrs,
        otHrs,
        remarks:     r.remarks     || "",
        createdById: r.created_by_id || "",
        createdByName: r.created_by_name || "",
      };
    });

    const guards = (guardsRes.data || []).map(r => ({
      id:          r.id,
      date:        r.date        || "",
      siteCode:    r.site_code   || "",
      name:        r.name        || "",
      designation: r.type        || "Security Guard",
      department:  r.location    || "",
      status:      r.status      || "",
      inTime:      r.in_time     || "",
      outTime:     r.out_time    || "",
      shift:       r.shift       || "Day",
      remarks:     r.remarks     || "",
      createdById: r.created_by_id || "",
      createdByName: r.created_by_name || "",
    }));

    const staffContacts = (scRes.data || []).map(r => ({
      id:          r.id,
      sNo:         r.id,
      site:        r.project_id   || "",
      empId:       r.emp_id        || "",
      joiningDate: r.joining_date  || "",
      email:       r.email         || "",
      name:        r.name          || "",
      designation: r.designation   || "",
      department:  r.department    || "",
      manager:     r.manager       || "",
      contact:     r.contact_no    || "",
      createdById: r.created_by_id || "",
      createdByName: r.created_by_name || "",
    }));

    const guardContacts = (gcRes.data || []).map(r => ({
      id:          r.id,
      sNo:         r.id,
      site:        r.project_id  || "",
      name:        r.name        || "",
      joiningDate: r.joining_date|| "",
      designation: r.designation || "",
      status:      r.status      || "",
      shift:       r.shift_duty  || "",
      contact:     r.contact_no  || "",
      remarks:     r.remarks     || "",
      createdById: r.created_by_id || "",
      createdByName: r.created_by_name || "",
    }));

    const result = { staff, guards, staffContacts, guardContacts, contacts: staffContacts };
    setCache(projectId, result);
    res.json(result);
  } catch (err) {
    console.error("Attendance read error:", err.message);
    res.status(500).json({ error: "Failed to fetch attendance data" });
  }
});

/* ═══════════════════════════════════
   POST /api/attendance/add/:projectId/:sheetName
═══════════════════════════════════ */
router.post("/add/:projectId/:sheetName", async (req, res) => {
  try {
    const { projectId, sheetName } = req.params;
    clearCache(projectId);
    const data = req.body;

    if (sheetName === "Staff") {
      const { error } = await supabase.schema("attendance").from("attendance").insert({
        project_id:  projectId,
        date:        data.date        || null,
        site_code:   data.siteCode    || data.site || projectId,
        name:        data.name        || "",
        designation: data.designation || "",
        department:  data.department  || "",
        status:      data.status      || "Absent",
        in_time:     data.inTime      || data.in_time  || "",
        out_time:    data.outTime     || data.out_time || "",
        shift:       data.shift       || "Day",
        remarks:     data.remarks     || "",
        created_by_id:   data.createdById   || "",
        created_by_name: data.createdByName || "",
      });
      if (error) throw error;

    } else if (sheetName === "Guard") {
      const { error } = await supabase.schema("attendance").from("guard_attendance").insert({
        project_id: projectId,
        date:       data.date        || null,
        site_code:  data.siteCode    || data.site || projectId,
        name:       data.name        || "",
        type:       data.designation || data.type || "Security Guard",
        location:   data.department  || data.location || "",
        status:     data.status      || "Absent",
        in_time:    data.inTime      || data.in_time  || "",
        out_time:   data.outTime     || data.out_time || "",
        shift:      data.shift       || "Day",
        remarks:    data.remarks     || "",
        created_by_id:   data.createdById   || "",
        created_by_name: data.createdByName || "",
      });
      if (error) throw error;

    } else if (sheetName === "SC" || sheetName === "Contact") {
      // Duplicate EmpID check
      if (data.empId) {
        const { data: existing } = await supabase.schema("attendance")
          .from("staff_contacts")
          .select("id")
          .eq("project_id", projectId)
          .ilike("emp_id", data.empId);
        if (existing?.length > 0)
          return res.status(400).json({ error: "Duplicate Employee ID", detail: `EmpID "${data.empId}" is already registered` });
      }
      const { error } = await supabase.schema("attendance").from("staff_contacts").insert({
        project_id:   projectId,
        emp_id:       data.empId       || "",
        joining_date: data.joiningDate || null,
        email:        data.emailId     || data.email || "",
        name:         data.name        || "",
        designation:  data.designation || "",
        department:   data.department  || "",
        manager:      data.manager     || "",
        contact_no:   data.contactNo   || data.contact || "",
        created_by_id:   data.createdById   || "",
        created_by_name: data.createdByName || "",
      });
      if (error) throw error;

    } else if (sheetName === "GC") {
      const { error } = await supabase.schema("attendance").from("guard_contacts").insert({
        project_id:   projectId,
        name:         data.name        || "",
        joining_date: data.joiningDate || null,
        designation:  data.designation || "Security Guard",
        status:       data.status      || "Deactive",
        shift_duty:   data.shift       || data.shiftDuty || "",
        contact_no:   data.contactNo   || data.contact || "",
        remarks:      data.remarks     || "",
        created_by_id:   data.createdById   || "",
        created_by_name: data.createdByName || "",
      });
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("ADD ERROR:", err.message);
    res.status(500).json({ error: "Failed to add record", detail: err.message });
  }
});

/* ═══════════════════════════════════
   PATCH /api/attendance/update/:projectId/:sheetName/:id
═══════════════════════════════════ */
router.patch("/update/:projectId/:sheetName/:id", async (req, res) => {
  try {
    const { projectId, sheetName, id } = req.params;
    clearCache(projectId);
    const data = req.body;

    if (sheetName === "Staff") {
      const { error } = await supabase.schema("attendance").from("attendance").update({
        date:        data.date        || null,
        site_code:   data.siteCode    || data.site || projectId,
        name:        data.name        || "",
        designation: data.designation || "",
        department:  data.department  || "",
        status:      data.status      || "Absent",
        in_time:     data.inTime      || data.in_time  || "",
        out_time:    data.outTime     || data.out_time || "",
        shift:       data.shift       || "Day",
        remarks:     data.remarks     || "",
      }).eq("id", id);
      if (error) throw error;

    } else if (sheetName === "Guard") {
      const { error } = await supabase.schema("attendance").from("guard_attendance").update({
        date:      data.date        || null,
        site_code: data.siteCode    || data.site || projectId,
        name:      data.name        || "",
        type:      data.designation || data.type || "Security Guard",
        location:  data.department  || data.location || "",
        status:    data.status      || "Absent",
        in_time:   data.inTime      || data.in_time  || "",
        out_time:  data.outTime     || data.out_time || "",
        shift:     data.shift       || "Day",
        remarks:   data.remarks     || "",
      }).eq("id", id);
      if (error) throw error;

    } else if (sheetName === "SC" || sheetName === "Contact") {
      const { error } = await supabase.schema("attendance").from("staff_contacts").update({
        emp_id:       data.empId       || "",
        joining_date: data.joiningDate || null,
        email:        data.emailId     || data.email || "",
        name:         data.name        || "",
        designation:  data.designation || "",
        department:   data.department  || "",
        manager:      data.manager     || "",
        contact_no:   data.contactNo   || data.contact || "",
      }).eq("id", id);
      if (error) throw error;

    } else if (sheetName === "GC") {
      const { error } = await supabase.schema("attendance").from("guard_contacts").update({
        name:         data.name        || "",
        joining_date: data.joiningDate || null,
        designation:  data.designation || "Security Guard",
        status:       data.status      || "Deactive",
        shift_duty:   data.shift       || data.shiftDuty || "",
        contact_no:   data.contactNo   || data.contact || "",
        remarks:      data.remarks     || "",
      }).eq("id", id);
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("UPDATE ERROR:", err.message);
    res.status(500).json({ error: "Update failed", detail: err.message });
  }
});

/* ═══════════════════════════════════
   DELETE /api/attendance/delete/:projectId/:sheetName/:id
═══════════════════════════════════ */
router.delete("/delete/:projectId/:sheetName/:id", async (req, res) => {
  try {
    const { projectId } = req.params;
    clearCache(projectId);
    const { sheetName, id } = req.params;
    const tableMap = { Staff: "attendance", Guard: "guard_attendance", SC: "staff_contacts", Contact: "staff_contacts", GC: "guard_contacts" };
    const table = tableMap[sheetName];
    if (!table) return res.status(400).json({ error: `Unknown sheet: ${sheetName}` });
    const { error } = await schemaFrom(table).delete().eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ERROR:", err.message);
    res.status(500).json({ error: "Delete failed", detail: err.message });
  }
});

/* ═══════════════════════════════════
   POST /api/attendance/bulk-upload/:projectId/:type
═══════════════════════════════════ */
const EXPECTED_HEADERS = {
  staff:   ["Date", "SiteCode", "Name", "Designation", "Department", "Status", "InTime", "OutTime", "Shift", "Remarks"],
  guard:   ["Date", "SiteCode", "Name", "Type", "Location", "Status", "InTime", "OutTime", "Shift", "Remarks"],
  contact: ["S.No", "Site", "EmpID", "JoiningDate", "Email", "Name", "Designation", "Department", "Manager", "Contact"],
  sc:      ["S.No", "Site", "EmpID", "JoiningDate", "Email", "Name", "Designation", "Department", "Manager", "Contact"],
  gc:      ["S.No", "Site", "Name", "JoiningDate", "Designation", "Status", "ShiftDuty", "ContactNo", "Remarks"],
};

const parseCSVLine = (line) => {
  const result = []; let cur = "", inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
};

const normalizeHeader = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

router.post("/bulk-upload/:projectId/:type", upload.single("file"), async (req, res) => {
  try {
    const { projectId, type } = req.params;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const expected = EXPECTED_HEADERS[type];
    if (!expected) return res.status(400).json({ error: `Unknown type: ${type}` });

    const csv   = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: "CSV is empty or has no data rows" });

    const headerRow  = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
    const missingCols = expected.filter((h, i) => normalizeHeader(headerRow[i]) !== normalizeHeader(h));
    if (missingCols.length > 0 || headerRow.length < expected.length)
      return res.status(400).json({ error: "Wrong column format", detail: `Expected: ${expected.join(", ")}\nGot: ${headerRow.join(", ")}` });

    const errors = [], rows = [];
    lines.slice(1).forEach((line, idx) => {
      const rowNum = idx + 2;
      const clean  = parseCSVLine(line).map(c => c.replace(/^"|"$/g, "").trim());
      if (clean.every(c => !c)) return;

      if (type === "staff") {
        if (!clean[0]) { errors.push(`Row ${rowNum}: Date required`); return; }
        if (!clean[2]) { errors.push(`Row ${rowNum}: Name required`); return; }
        rows.push({ project_id: projectId, date: clean[0] || null, site_code: clean[1] || projectId, name: clean[2], designation: clean[3] || "", department: clean[4] || "", status: clean[5] || "Absent", in_time: clean[6] || "", out_time: clean[7] || "", shift: clean[8] || "Day", remarks: clean[9] || "", created_by_id: req.body.createdById || null, created_by_name: req.body.createdByName || "Bulk Upload" });

      } else if (type === "guard") {
        if (!clean[0]) { errors.push(`Row ${rowNum}: Date required`); return; }
        if (!clean[2]) { errors.push(`Row ${rowNum}: Name required`); return; }
        rows.push({ project_id: projectId, date: clean[0] || null, site_code: clean[1] || projectId, name: clean[2], type: clean[3] || "Security Guard", location: clean[4] || "", status: clean[5] || "Absent", in_time: clean[6] || "", out_time: clean[7] || "", shift: clean[8] || "Day", remarks: clean[9] || "", created_by_id: req.body.createdById || null, created_by_name: req.body.createdByName || "Bulk Upload" });

      } else if (type === "contact" || type === "sc") {
        if (!clean[5]) { errors.push(`Row ${rowNum}: Name required`); return; }
        rows.push({ project_id: projectId, emp_id: clean[2] || "", joining_date: clean[3] || null, email: clean[4] || "", name: clean[5], designation: clean[6] || "", department: clean[7] || "", manager: clean[8] || "", contact_no: clean[9] || "", created_by_id: req.body.createdById || null, created_by_name: req.body.createdByName || "Bulk Upload" });

      } else if (type === "gc") {
        if (!clean[2]) { errors.push(`Row ${rowNum}: Name required`); return; }
        rows.push({ project_id: projectId, name: clean[2], joining_date: clean[3] || null, designation: clean[4] || "Security Guard", status: clean[5] || "Deactive", shift_duty: clean[6] || "", contact_no: clean[7] || "", remarks: clean[8] || "", created_by_id: req.body.createdById || null, created_by_name: req.body.createdByName || "Bulk Upload" });
      }
    });

    if (errors.length > 0) return res.status(400).json({ error: "Validation errors", detail: errors.join("\n") });
    if (!rows.length)      return res.status(400).json({ error: "No valid rows found in CSV" });

    const tableMap = { staff: "attendance", guard: "guard_attendance", contact: "staff_contacts", sc: "staff_contacts", gc: "guard_contacts" };
    const { error } = await schemaFrom(tableMap[type]).insert(rows);
    if (error) throw error;

    res.json({ success: true, rowsAdded: rows.length });
  } catch (err) {
    console.error("BULK UPLOAD ERROR:", err.message);
    res.status(500).json({ error: "Bulk upload failed", detail: err.message });
  }
});

module.exports = router;
