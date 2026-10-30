const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, removeStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { renderPdf } = require("../services/pdfService");
const { renderPolicyHtml, renderPolicyHeader, renderPolicyFooter } = require("../pdf/policyTemplate");
const { requirePerm } = require("../helpers/permHelper");
const { companyIdFrom, scopeQuery } = require("../helpers/companyScope");

const upload = multer({ storage: multer.memoryStorage() });

const uploadToStorage = async (bucket, path, buffer, mimetype) =>
  uploadStorageFile(supabase, bucket, path, buffer, mimetype);

const removeFromStorage = async (bucket, path) =>
  removeStorageFile(supabase, bucket, path);

const getNextEmployeeCode = async (offset = 0) => {
  const { data } = await supabase.schema("organisation").from("employees").select("contact_code");
  const nums = (data || [])
    .map(r => parseInt((r.contact_code || "").replace("CON-", "")) || 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1 + offset;
  return `CON-${String(next).padStart(3, "0")}`;
};

const missingColumn = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "42703" || err?.code === "PGRST204" || msg.includes("could not find") || msg.includes("column");
};

const mapEmployee = (r) => ({
  id:             r.id,
  companyId:      r.company_id      || null,
  contactCode:    r.contact_code    || "",
  personName:     r.person_name     || "",
  contactNumber:  r.contact_number  || "",
  designation:    r.designation     || "",
  company:        r.company         || "",
  division:       r.division        || "",
  email:          r.email           || "",
  department:     r.department      || "",
  reportingTo:    r.reporting_to    || "",
  status:         r.status          || "active",
  staffType:      r.staff_type      || "",
  workLocation:   r.work_location   || "",
  role:           r.role            || "",
  team:           r.team            || "",
  bio:            r.bio             || "",
  tags:           r.tags            || "",
  employeeId:     r.employee_id     || "",
  profileImage:   r.profile_image   || "",
  dateOfBirth:    r.date_of_birth   ? String(r.date_of_birth).slice(0, 10) : "",
  gender:         r.gender          || "",
  maritalStatus:  r.marital_status  || "",
  nationality:    r.nationality     || "",
  alternatePhone: r.alternate_phone || "",
  address:        r.address         || "",
  joiningDate:    r.joining_date    ? String(r.joining_date).slice(0, 10) : "",
  category:        r.category         || "",
  postedKind:      r.posted_kind      || "",
  postedId:        r.posted_id        || "",
  employedThrough: r.employed_through || "direct",
  agencyVendorId:  r.agency_vendor_id || "",
});

// What an employee does — Staff Type (Permanent / Probation …) is separate
const CATEGORIES = ["Office Staff", "Site Staff", "Guard", "Driver", "Cook"]; // no Labour — not kept in Employees
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normName  = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
const normPhone = (v) => String(v || "").replace(/\D/g, "").slice(-10);

// Category, posting and agency fields as stored
const placementFields = (b) => {
  const kind = b.postedKind === "office" ? "office" : b.postedKind === "project" ? "project" : null;
  const agency = b.employedThrough === "agency";
  return {
    category:         CATEGORIES.includes(b.category) ? b.category : null,
    posted_kind:      kind && UUID_RE.test(b.postedId || "") ? kind : null,
    posted_id:        kind && UUID_RE.test(b.postedId || "") ? b.postedId : null,
    employed_through: agency ? "agency" : "direct",
    agency_vendor_id: agency && UUID_RE.test(b.agencyVendorId || "") ? b.agencyVendorId : null,
  };
};

// Same person already there? Employee ID when given, else name + mobile.
// Two people may share a name (two guards called Ramesh Kumar), not a mobile.
const findDuplicate = async (company_id, { employeeId, personName, contactNumber }, exceptId) => {
  let q = supabase.schema("organisation").from("employees").select("id, person_name, employee_id, contact_number");
  q = company_id ? q.eq("company_id", company_id) : q.is("company_id", null);
  const { data } = await q;
  const others = (data || []).filter(r => r.id !== exceptId);
  const id = String(employeeId || "").trim().toLowerCase();
  if (id) {
    const hit = others.find(r => String(r.employee_id || "").trim().toLowerCase() === id);
    if (hit) return `Employee ID "${employeeId.trim()}" is already used by ${hit.person_name}`;
  }
  const name = normName(personName), phone = normPhone(contactNumber);
  const hit = others.find(r => normName(r.person_name) === name && normPhone(r.contact_number) === phone);
  return hit ? `${hit.person_name} with mobile ${contactNumber} already exists` : null;
};

/* GET /api/organisation/employees */
router.get("/employees", async (req, res) => {
  try {
    const { data, error } = await scopeQuery(supabase
      .schema("organisation").from("employees").select("*"), req).order("contact_code", { ascending: true });
    if (error) throw error;
    res.json({ contacts: (data || []).map(mapEmployee) });
  } catch (err) {
    console.error("Employees read error:", err.message);
    res.json({ contacts: [] });
  }
});

/* POST /api/organisation/employees */
router.post("/employees", requirePerm("employees", "can_add"), async (req, res) => {
  try {
    const { personName, contactNumber, designation, company, division, email, department, reportingTo, status, staffType,
            workLocation, role, team, bio, tags, employeeId,
            dateOfBirth, gender, maritalStatus, nationality,
            alternatePhone, address, joiningDate,
            createdById, createdByName } = req.body;

    // Employee ID and email are optional (guards, many site staff have neither)
    if (!personName?.trim()) return res.status(400).json({ error: "Name is required" });
    if (normPhone(contactNumber).length < 10) return res.status(400).json({ error: "A 10-digit mobile number is required" });

    const company_id = companyIdFrom(req.body);
    const dup = await findDuplicate(company_id, req.body);
    if (dup) return res.status(409).json({ duplicate: true, error: dup, message: dup });

    const code = await getNextEmployeeCode();
    const payload = {
      contact_code: code, person_name: personName || "",
      contact_number: contactNumber || "", designation: designation || "",
      company: company || "", division: division || "", email: email || "", department: department || "",
      reporting_to: reportingTo || "", status: status || "active", staff_type: staffType || null,
      work_location: workLocation || "", role: role || "", team: team || "",
      bio: bio || "", tags: tags || "", employee_id: (employeeId || "").trim(),
      date_of_birth: dateOfBirth || null, gender: gender || "",
      marital_status: maritalStatus || "", nationality: nationality || "",
      alternate_phone: alternatePhone || "", address: address || "",
      joining_date: joiningDate || null,
      created_by_id: createdById || null, created_by_name: createdByName || null,
      company_id,
      ...placementFields(req.body),
    };

    let { data, error } = await supabase.schema("organisation").from("employees").insert(payload).select().single();
    for (let retry = 1; retry <= 5 && error?.code === "23505" && error?.message?.includes("contact_code"); retry++) {
      const retryCode = await getNextEmployeeCode(retry);
      ({ data, error } = await supabase.schema("organisation").from("employees").insert({ ...payload, contact_code: retryCode }).select().single());
    }
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error("Employee add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/organisation/employees/move — shift employees to another company.
   Same rows (same id), so orders, attendance and history stay with them.
   Skips anyone whose Employee ID is already taken in the target company.
   Returns the division / department / designation / grade / team names the
   target company does not have yet, so they can be added there. */
router.post("/employees/move", requirePerm("employees", "can_edit"), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const company_id = companyIdFrom(req.body);
    if (!ids.length || !company_id) return res.status(400).json({ error: "Employees and company are required" });

    const org = supabase.schema("organisation");
    const { data: company } = await org.from("companies").select("id, company_name").eq("id", company_id).maybeSingle();
    if (!company) return res.status(404).json({ error: "Company not found" });

    const { data: emps, error: eErr } = await org.from("employees").select("*").in("id", ids);
    if (eErr) throw eErr;
    const { data: taken } = await org.from("employees").select("employee_id").eq("company_id", company_id);
    const takenIds = new Set((taken || []).map(t => (t.employee_id || "").trim().toLowerCase()).filter(Boolean));

    const toMove = [], skipped = [];
    for (const e of emps || []) {
      if (e.company_id === company_id) continue;
      const eid = (e.employee_id || "").trim().toLowerCase();
      if (eid && takenIds.has(eid)) { skipped.push({ name: e.person_name, reason: `Employee ID ${e.employee_id} already exists there` }); continue; }
      if (eid) takenIds.add(eid);
      toMove.push(e);
    }

    if (toMove.length) {
      const moveIds = toMove.map(e => e.id);
      const { error } = await org.from("employees").update({ company_id, company: company.company_name || "" }).in("id", moveIds);
      if (error) throw error;

      // teams belong to the old company — take the moved people out of them
      const { data: teams } = await org.from("teams").select("id, leader_id, member_ids");
      for (const t of teams || []) {
        const members = Array.isArray(t.member_ids) ? t.member_ids : [];
        const left = members.filter(m => !moveIds.includes(m));
        const leaderGone = moveIds.includes(t.leader_id);
        if (left.length !== members.length || leaderGone) {
          await org.from("teams").update({ member_ids: left, ...(leaderGone ? { leader_id: null } : {}) }).eq("id", t.id);
        }
      }
    }

    // names the target company's lists don't have yet
    const [divs, depts, desigs, grades, teamsThere] = await Promise.all([
      org.from("divisions").select("name").eq("company_id", company_id),
      org.from("departments").select("name").eq("company_id", company_id),
      org.from("designations").select("title").eq("company_id", company_id),
      org.from("grades").select("grade").eq("company_id", company_id),
      org.from("teams").select("name").eq("company_id", company_id),
    ]);
    const has = (rows, col) => new Set((rows.data || []).map(r => (r[col] || "").trim().toLowerCase()));
    const lists = [
      ["Division", "division", has(divs, "name")],
      ["Department", "department", has(depts, "name")],
      ["Designation", "designation", has(desigs, "title")],
      ["Grade", "grade", has(grades, "grade")],
      ["Team", "team", has(teamsThere, "name")],
    ];
    const missing = {};
    for (const [label, col, set] of lists) {
      const names = [...new Set(toMove.map(e => (e[col] || "").trim()).filter(n => n && !set.has(n.toLowerCase())))];
      if (names.length) missing[label] = names;
    }

    res.json({ success: true, moved: toMove.map(e => e.id), company: company.company_name, skipped, missing });
  } catch (err) {
    console.error("Employee move error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/organisation/employees/:id */
router.put("/employees/:id", requirePerm("employees", "can_edit"), async (req, res) => {
  try {
    const { personName, contactNumber, designation, company, division, email, department, reportingTo, status, staffType,
            workLocation, role, team, bio, tags, employeeId,
            dateOfBirth, gender, maritalStatus, nationality,
            alternatePhone, address, joiningDate } = req.body;
    if (!personName?.trim()) return res.status(400).json({ error: "Name is required" });
    if (normPhone(contactNumber).length < 10) return res.status(400).json({ error: "A 10-digit mobile number is required" });
    const { data: cur } = await supabase.schema("organisation").from("employees").select("company_id").eq("id", req.params.id).maybeSingle();
    if (!cur) return res.status(404).json({ error: "Employee not found" });
    const dup = await findDuplicate(cur.company_id, req.body, req.params.id);
    if (dup) return res.status(409).json({ duplicate: true, error: dup, message: dup });
    const update = {
      person_name: personName || "", contact_number: contactNumber || "",
      designation: designation || "", company: company || "", division: division || "", email: email || "",
      department: department || "", reporting_to: reportingTo || "", status: status || "active",
      staff_type: staffType || null,
      work_location: workLocation || "", role: role || "", team: team || "",
      bio: bio || "", tags: tags || "", employee_id: (employeeId || "").trim(),
      date_of_birth: dateOfBirth || null, gender: gender || "",
      marital_status: maritalStatus || "", nationality: nationality || "",
      alternate_phone: alternatePhone || "", address: address || "",
      joining_date: joiningDate || null,
      // smaller forms (Orders' Contact Person) don't send these — keep them
      ...("category" in req.body ? placementFields(req.body) : {}),
    };
    const { error } = await supabase.schema("organisation").from("employees").update(update).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Employee update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/organisation/employees/:id/profile-image */
router.post("/employees/:id/profile-image", requirePerm("employees", "can_edit"), upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No image provided" });
    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const storagePath = `avatar/employees/${id}.${ext}`;
    await uploadToStorage("picture", storagePath, req.file.buffer, req.file.mimetype);
    const { error } = await supabase.schema("organisation").from("employees").update({ profile_image: storagePath }).eq("id", id);
    if (error) throw error;
    res.json({ success: true, path: storagePath });
  } catch (err) {
    console.error("Employee image upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/organisation/employees/:id/profile-image */
router.delete("/employees/:id/profile-image", requirePerm("employees", "can_edit"), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: emp } = await supabase.schema("organisation").from("employees").select("profile_image").eq("id", id).single();
    if (emp?.profile_image) await removeFromStorage("picture", emp.profile_image);
    await supabase.schema("organisation").from("employees").update({ profile_image: null }).eq("id", id);
    res.json({ success: true });
  } catch (err) {
    console.error("Employee image delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/organisation/employees/:id */
router.delete("/employees/:id", requirePerm("employees", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase.schema("organisation").from("employees").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Employee delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/organisation/employees/bulk */
router.post("/employees/bulk", requirePerm("employees", "can_add"), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows?.length) return res.status(400).json({ error: "No rows provided" });
    const company_id = companyIdFrom(req.body);
    let existingQ = supabase.schema("organisation").from("employees").select("employee_id, person_name");
    existingQ = company_id ? existingQ.eq("company_id", company_id) : existingQ.is("company_id", null);
    const { data: existing } = await existingQ;
    const existingIds   = new Set((existing || []).map(r => String(r.employee_id || "").trim().toLowerCase()).filter(Boolean));
    const existingNames = new Set((existing || []).map(r => String(r.person_name || "").trim().toLowerCase()).filter(Boolean));
    const results = { inserted: 0, skipped: 0, errors: [] };
    for (const row of rows) {
      const empId   = String(row["Employee ID"] || "").trim();
      const name    = String(row["Person Name"] || "").trim();
      if (!empId) { results.skipped++; continue; }
      if (existingIds.has(empId.toLowerCase()) || existingNames.has(name.toLowerCase())) { results.skipped++; continue; }
      const code = await getNextEmployeeCode(results.inserted);
      const { error } = await supabase.schema("organisation").from("employees").insert({
        contact_code: code, person_name: name, contact_number: String(row["Phone Number"] || ""),
        designation: String(row["Designation"] || ""), company: String(row["Company"] || ""),
        division: String(row["Division"] || ""),
        email: String(row["Work Email"] || ""), department: String(row["Department"] || ""),
        reporting_to: String(row["Reporting To"] || ""), status: "active",
        work_location: String(row["Work Location"] || ""), role: String(row["Role"] || ""),
        team: String(row["Team"] || ""), employee_id: empId,
        joining_date: row["Joining Date"] || null, date_of_birth: row["Date of Birth"] || null,
        gender: String(row["Gender"] || ""),
        company_id,
      });
      if (error) results.errors.push({ row: name, error: error.message });
      else { results.inserted++; existingIds.add(empId.toLowerCase()); existingNames.add(name.toLowerCase()); }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    console.error("Employee bulk error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   POLICIES
════════════════════════════════════ */

const getNextPolicyCode = async (offset = 0) => {
  const { data } = await supabase.schema("organisation").from("policies").select("policy_code");
  const nums = (data || []).map(r => parseInt((r.policy_code || "").replace("POL-", "")) || 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1 + offset;
  return `POL-${String(next).padStart(3, "0")}`;
};

const getPolicyLogoDataUri = async (comp) => {
  try {
    const logoPath = comp.logo_url || comp.logoUrl || comp.logo_path;
    if (!logoPath) return "";
    const signed = await createSignedStorageUrl(supabase, "picture", logoPath, 120);
    if (!signed) return "";
    const res = await fetch(signed);
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/png";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return ""; }
};

router.get("/policies", async (req, res) => {
  try {
    const { company_id } = req.query;
    let q = supabase.schema("organisation").from("policies").select("*").order("created_at", { ascending: false });
    if (company_id) q = q.eq("company_id", company_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ policies: data || [] });
  } catch (err) {
    console.error("Policies read error:", err.message);
    res.json({ policies: [] });
  }
});

router.post("/policies", requirePerm("policy", "can_add"), async (req, res) => {
  try {
    const { title, category, version, status, effectiveDate, reviewDate,
            department, content, approvedBy, companyId, createdById, createdByName } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    const code = await getNextPolicyCode();
    const { data, error } = await supabase.schema("organisation").from("policies").insert({
      policy_code: code, title: title.trim(),
      category: category || "General", version: version || "v1.0",
      status: status || "draft", effective_date: effectiveDate || null,
      review_date: reviewDate || null, department: department || "",
      content: content || "", approved_by: approvedBy || "",
      company_id: companyId || null,
      created_by_id: createdById || null, created_by_name: createdByName || null,
    }).select().single();
    if (error) throw error;
    res.json({ success: true, id: data.id, policy_code: data.policy_code });
  } catch (err) {
    console.error("Policy add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/policies/:id", requirePerm("policy", "can_edit"), async (req, res) => {
  try {
    const { title, category, version, status, effectiveDate, reviewDate,
            department, content, approvedBy } = req.body;
    const { error } = await supabase.schema("organisation").from("policies").update({
      title: title?.trim() || "", category: category || "General",
      version: version || "v1.0", status: status || "draft",
      effective_date: effectiveDate || null, review_date: reviewDate || null,
      department: department || "", content: content || "",
      approved_by: approvedBy || "", updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Policy update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/policies/:id", requirePerm("policy", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase.schema("organisation").from("policies").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Policy delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/policies/:id/pdf", async (req, res) => {
  try {
    const { data: policy, error: pErr } = await supabase.schema("organisation").from("policies")
      .select("*").eq("id", req.params.id).single();
    if (pErr) { console.error("Policy PDF fetch error:", pErr); return res.status(404).json({ error: pErr.message || "Policy not found" }); }
    if (!policy) return res.status(404).json({ error: "Policy not found" });

    let comp = {};
    if (policy.company_id) {
      const { data: c } = await supabase.schema("organisation").from("companies")
        .select("company_name,address,logo_url").eq("id", policy.company_id).single();
      if (c) comp = c;
    }

    const logoDataUri     = await getPolicyLogoDataUri(comp);
    const html            = renderPolicyHtml(policy);
    const headerTemplate  = renderPolicyHeader(policy, comp, logoDataUri);
    const footerTemplate  = renderPolicyFooter(comp);

    const pdfBuffer = await renderPdf(html, { headerTemplate, footerTemplate });
    console.log("Policy PDF buffer size:", pdfBuffer?.length, "bytes");
    if (!pdfBuffer || pdfBuffer.length < 100) {
      console.error("Policy PDF: empty or too small buffer");
      return res.status(500).json({ error: "PDF generation produced empty file" });
    }
    const safeName  = (policy.title || "policy").replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-");
    const filename  = `${policy.policy_code}-${safeName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Policy PDF error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   DIVISIONS
════════════════════════════════════ */
const nextDivId = async () => {
  const { data } = await supabase.schema("organisation").from("divisions").select("div_id").not("div_id", "is", null);
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt((r.div_id || "DIV-000").replace("DIV-", "")) || 0), 0);
  return `DIV-${String(max + 1).padStart(3, "0")}`;
};

router.get("/divisions", async (req, res) => {
  const { data, error } = await scopeQuery(supabase.schema("organisation").from("divisions").select("*"), req).order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ divisions: data || [] });
});
router.post("/divisions", requirePerm("divisions", "can_add"), async (req, res) => {
  const { name, status } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  const div_id = await nextDivId();
  const { data, error } = await supabase.schema("organisation").from("divisions").insert({ div_id, name: name.trim(), status: status || "active", company_id: companyIdFrom(req.body) }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, division: data });
});
router.put("/divisions/:id", requirePerm("divisions", "can_edit"), async (req, res) => {
  const { name, status } = req.body;
  const { data, error } = await supabase.schema("organisation").from("divisions").update({ name: name?.trim(), status }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, division: data });
});
router.delete("/divisions/:id", requirePerm("divisions", "can_delete"), async (req, res) => {
  const { error } = await supabase.schema("organisation").from("divisions").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ════════════════════════════════════
   GRADES
════════════════════════════════════ */
const nextGradeId = async () => {
  const { data } = await supabase.schema("organisation").from("grades").select("grade_id").not("grade_id", "is", null);
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt((r.grade_id || "GRD-000").replace("GRD-", "")) || 0), 0);
  return `GRD-${String(max + 1).padStart(3, "0")}`;
};

router.get("/grades", async (req, res) => {
  const { data, error } = await scopeQuery(supabase.schema("organisation").from("grades").select("*"), req).order("sort_order");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ grades: data || [] });
});
router.post("/grades", requirePerm("grades", "can_add"), async (req, res) => {
  const { grade, descriptions, sort_order, status } = req.body;
  if (!grade?.trim()) return res.status(400).json({ error: "Grade is required" });
  const grade_id = await nextGradeId();
  const { data, error } = await supabase.schema("organisation").from("grades")
    .insert({ grade_id, grade: grade.trim(), descriptions: descriptions || [], sort_order: sort_order || 1, status: status || "active", company_id: companyIdFrom(req.body) }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, grade: data });
});
router.put("/grades/:id", requirePerm("grades", "can_edit"), async (req, res) => {
  const { grade, descriptions, sort_order, status } = req.body;
  const updates = {};
  if (grade !== undefined) updates.grade = grade.trim();
  if (descriptions !== undefined) updates.descriptions = descriptions;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (status !== undefined) updates.status = status;
  const { data, error } = await supabase.schema("organisation").from("grades").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, grade: data });
});
router.delete("/grades/:id", requirePerm("grades", "can_delete"), async (req, res) => {
  const { error } = await supabase.schema("organisation").from("grades").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ════════════════════════════════════
   ORG DESIGNATIONS
════════════════════════════════════ */
const nextDesigId = async () => {
  const { data } = await supabase.schema("organisation").from("designations").select("desig_id").not("desig_id", "is", null);
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt((r.desig_id || "DSIG-000").replace("DSIG-", "")) || 0), 0);
  return `DSIG-${String(max + 1).padStart(3, "0")}`;
};

router.get("/org-designations", async (req, res) => {
  const { data, error } = await scopeQuery(supabase.schema("organisation").from("designations").select("*"), req).order("title");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ designations: data || [] });
});
router.post("/org-designations", requirePerm("designations", "can_add"), async (req, res) => {
  const { title, grade, active } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
  const desig_id = await nextDesigId();
  const { data, error } = await supabase.schema("organisation").from("designations")
    .insert({ desig_id, title: title.trim(), grade: grade || null, active: active !== false, company_id: companyIdFrom(req.body) }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, designation: data });
});
router.put("/org-designations/:id", requirePerm("designations", "can_edit"), async (req, res) => {
  const { title, grade, active } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (grade !== undefined) updates.grade = grade || null;
  if (active !== undefined) updates.active = active;
  const { data, error } = await supabase.schema("organisation").from("designations").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, designation: data });
});
router.delete("/org-designations/:id", requirePerm("designations", "can_delete"), async (req, res) => {
  const { error } = await supabase.schema("organisation").from("designations").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* GET /api/organisation/employee-options?company_id= — lists the Employee
   form picks from: where someone is posted (the company's projects and
   offices) and which agency they come through (vendors) */
router.get("/employee-options", async (req, res) => {
  try {
    const [p, b, v] = await Promise.all([
      scopeQuery(supabase.from("projects").select("id, project_code, project_name, is_active, company_id"), req).order("project_name"),
      scopeQuery(supabase.schema("organisation").from("branches").select("id, code, label, status, company_id"), req).order("label"),
      supabase.schema("procurement").from("vendors").select("id, vendor_name").is("deleted_at", null).order("vendor_name"),
    ]);
    if (p.error) throw p.error;
    res.json({
      projects: (p.data || []).filter(r => r.is_active !== false).map(r => ({ id: r.id, code: r.project_code || "", name: r.project_name || r.project_code || "" })),
      offices:  (b.data || []).filter(r => (r.status || "active") === "active").map(r => ({ id: r.id, code: r.code || "", name: r.label || r.code || "" })),
      agencies: (v.data || []).map(r => ({ id: r.id, name: r.vendor_name || "" })),
    });
  } catch (err) {
    console.error("Employee options error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   BRANCHES
════════════════════════════════════ */
router.get("/branches", async (req, res) => {
  const { data, error } = await scopeQuery(supabase.schema("organisation").from("branches").select("*"), req).order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ branches: data || [] });
});
router.post("/branches", requirePerm("locations", "can_add"), async (req, res) => {
  const { code, label, type, status, gstin, phone, email, is_main, state, city, pincode, address, contacts } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: "Label is required" });
  const { data, error } = await supabase.schema("organisation").from("branches")
    .insert({ code, label: label.trim(), type: type || "Branch", status: (status || "active").toLowerCase(), gstin, phone, email, is_main: is_main || false, state, city, pincode, address, contacts: contacts || [], company_id: companyIdFrom(req.body) }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, branch: data });
});
router.put("/branches/:id", requirePerm("locations", "can_edit"), async (req, res) => {
  const { code, label, type, status, gstin, phone, email, is_main, state, city, pincode, address, contacts } = req.body;
  const { data, error } = await supabase.schema("organisation").from("branches")
    .update({ code, label: label?.trim(), type, status: status?.toLowerCase(), gstin, phone, email, is_main, state, city, pincode, address, contacts: contacts || [] }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, branch: data });
});
router.delete("/branches/:id", requirePerm("locations", "can_delete"), async (req, res) => {
  const { error } = await supabase.schema("organisation").from("branches").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Projects: one list (public.projects, routes/projects.js); each project
// carries its company_id — see sql/projects_into_company.sql.

module.exports = router;
