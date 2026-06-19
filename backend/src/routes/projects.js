const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase  = require("../helpers/supabaseHelper");
const {
  normalizeStoragePath,
  uploadStorageFile,
  createSignedStorageUrl,
} = require("../helpers/storageHelper");

const upload = multer({ storage: multer.memoryStorage() });

/* ─── Upload project logo to Supabase Storage ─── */
const uploadLogo = async (files) => {
  if (!files?.logo) return null;
  const file = files.logo[0];
  const path = `projects/logo_${Date.now()}_${file.originalname}`;
  return uploadStorageFile(supabase, "procurement-images", path, file.buffer, file.mimetype);
};

/* ── GET all projects ── */
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const projects = await Promise.all((data || []).map(async r => ({
      id:          r.id,
      projectName: r.project_name || "",
      projectCode: r.project_code || "",
      city:        r.city         || "",
      state:       r.state        || "",
      pincode:     r.pincode      || "",
      address:     r.address      || "",
      logoUrl:     r.logo_url ? await createSignedStorageUrl(supabase, "procurement-images", r.logo_url).catch(() => "") : "",
      isActive:    r.is_active !== false,
    })));
    res.json({ projects });
  } catch (err) {
    console.error("Projects read error:", err.message);
    res.json({ projects: [] });
  }
});

/* ── POST add project ── */
router.post("/", upload.fields([{ name: "logo", maxCount: 1 }]), async (req, res) => {
  try {
    const b = req.body;
    const logoUrl = await uploadLogo(req.files);
    const { data, error } = await supabase.from("projects").insert({
      project_name: b.projectName || "",
      project_code: b.projectCode || "",
      city:         b.city        || "",
      state:        b.state       || "",
      pincode:      b.pincode     || "",
      address:      b.address     || "",
      logo_url:     logoUrl       || "",
      is_active:    true,
      created_by_id: b.createdById || null,
      created_by_name: b.createdByName || null,
    }).select().single();
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error("Project add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT update project ── */
router.put("/:id", upload.fields([{ name: "logo", maxCount: 1 }]), async (req, res) => {
  try {
    const b = req.body;
    const newLogo = await uploadLogo(req.files);
    const { error } = await supabase.from("projects").update({
      project_name: b.projectName || "",
      project_code: b.projectCode || "",
      city:         b.city        || "",
      state:        b.state       || "",
      pincode:      b.pincode     || "",
      address:      b.address     || "",
      logo_url:     newLogo || normalizeStoragePath(b.logoUrl, "procurement-images") || "",
    }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Project update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── PATCH toggle active/inactive ── */
router.patch("/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;
    const { error } = await supabase.from("projects")
      .update({ is_active: isActive })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Project status error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE project ── */
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("projects").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Project delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST bulk insert projects (dedupe by project_code, then by name+city) ── */
router.post("/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ error: "No rows provided" });

    // Fetch existing for dedupe
    const { data: existing, error: fetchErr } = await supabase
      .from("projects")
      .select("project_code, project_name, city");
    if (fetchErr) throw fetchErr;

    const codeSet = new Set((existing || []).map(p => (p.project_code || "").trim().toLowerCase()).filter(Boolean));
    const nameCitySet = new Set((existing || []).map(p =>
      `${(p.project_name || "").trim().toLowerCase()}|${(p.city || "").trim().toLowerCase()}`
    ));

    const skipped = [];
    const seenInBatch = new Set();
    const inserts = [];

    for (const r of rows) {
      const code = (r.projectCode || "").trim();
      const name = (r.projectName || "").trim();
      const city = (r.city || "").trim();
      const codeKey = code.toLowerCase();
      const nameCityKey = `${name.toLowerCase()}|${city.toLowerCase()}`;

      // dedupe vs DB
      if (codeKey && codeSet.has(codeKey)) { skipped.push({ row: r, reason: `project_code "${code}" already exists` }); continue; }
      if (!codeKey && nameCitySet.has(nameCityKey)) { skipped.push({ row: r, reason: `project "${name}" in "${city}" already exists` }); continue; }

      // dedupe within the same upload batch
      const batchKey = codeKey || nameCityKey;
      if (seenInBatch.has(batchKey)) { skipped.push({ row: r, reason: "duplicate within upload" }); continue; }
      seenInBatch.add(batchKey);

      inserts.push({
        project_name: name,
        project_code: code,
        city,
        state:    r.state    || "",
        pincode:  r.pincode  || "",
        address:  r.address  || "",
        logo_url: "",
        is_active: true,
        created_by_id: null,
        created_by_name: "Bulk Upload",
      });
    }

    let inserted = 0;
    if (inserts.length > 0) {
      const { error } = await supabase.from("projects").insert(inserts);
      if (error) throw error;
      inserted = inserts.length;
    }

    res.json({ success: true, count: inserted, skipped: skipped.length, skippedDetails: skipped });
  } catch (err) {
    console.error("Bulk project insert error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
