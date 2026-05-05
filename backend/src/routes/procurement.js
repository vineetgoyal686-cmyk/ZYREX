const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase  = require("../helpers/supabaseHelper");
const {
  normalizeStoragePath,
  uploadStorageFile,
  createSignedStorageUrl,
  removeStorageFile,
} = require("../helpers/storageHelper");

const upload = multer({ storage: multer.memoryStorage() });

const normalizeNbsp = (value) =>
  typeof value === "string"
    ? value.replace(/&nbsp;|&#160;|\u00A0/g, " ")
    : value;

const sanitizeRichTextDeep = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeRichTextDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, sanitizeRichTextDeep(val)]));
  }
  return normalizeNbsp(value);
};

/* ─── Storage upload helper ─── */
router.post('/sign-urls', async (req, res) => {
  try {
    const { bucket, paths } = req.body;
    if (!bucket || typeof bucket !== "string") return res.status(400).json({ error: "Bucket is required" });
    if (!paths || !Array.isArray(paths) || paths.length === 0) return res.json({ urls: {} });
    
    const validPaths = paths
      .map(raw => ({ raw, path: normalizeStoragePath(raw, bucket) }))
      .filter(item => item.path && !/^data:|^blob:/i.test(item.path));
    if (validPaths.length === 0) return res.json({ urls: {} });

    const uniquePaths = [...new Set(validPaths.map(item => item.path))];
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(uniquePaths, 60 * 60 * 24);
    if (error) throw error;

    const signedByPath = new Map();
    (data || []).forEach(item => {
      if (item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    });

    const urls = {};
    validPaths.forEach(({ raw, path }) => {
      const signedUrl = signedByPath.get(path);
      if (signedUrl) {
        urls[raw] = signedUrl;
        urls[path] = signedUrl;
      }
    });
    
    res.json({ urls });
  } catch (err) {
    console.error('Sign urls error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const uploadToStorage = async (bucket, path, buffer, mimetype) => {
  return uploadStorageFile(supabase, bucket, path, buffer, mimetype);
};

const removeFromStorage = async (bucket, path) => {
  return removeStorageFile(supabase, bucket, path);
};

const signProcurementImageUrl = (value) => createSignedStorageUrl(supabase, "procurement-images", value);
const signVendorDocUrl = (value) => createSignedStorageUrl(supabase, "vendor-docs", value);

/* ════════════════════════════════════
   ITEMS
════════════════════════════════════ */

/* helper: parse JSON array stored in text column */
const parseJsonArr = (val) => {
  try { const b = JSON.parse(val || "[]"); return Array.isArray(b) ? b : [val].filter(Boolean); }
  catch { return val ? [val] : []; }
};
const parseBrands = parseJsonArr;

/* helper: next item code — separate sequences for Supply (ITM-) and SITC (SIT-) */
const getNextItemCode = async (itemType = "Supply") => {
  const prefix = itemType === "SITC" ? "SIT" : "ITM";
  const { data } = await supabase.schema("procurement").from("items")
    .select("item_code").eq("item_type", itemType);
  const nums = (data || []).map(r => parseInt((r.item_code || "").replace(`${prefix}-`, "")) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
};

router.get("/items", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("items")
      .select("*")
      .order("item_code", { ascending: true });
    if (error) throw error;
    const items = await Promise.all((data || []).map(async r => ({
      id:           r.id,
      itemCode:     r.item_code     || "",
      itemType:     r.item_type     || "Supply",
      materialName: r.material_name || "",
      brands:         parseBrands(r.make),
      specifications: parseJsonArr(r.description),
      category:     r.category      || "",
      unit:         r.unit          || "",
      imageUrl:     await createSignedStorageUrl(supabase, "procurement-images", r.image_url),
      remarks:      r.remarks       || "",
      createdById:  r.created_by_id || "",
      createdByName: r.created_by_name || "",
    })));
    res.json({ items });
  } catch (err) {
    console.error("Items read error:", err.message);
    res.json({ items: [] });
  }
});

router.post("/items", upload.single("image"), async (req, res) => {
  try {
    const { materialName, category, unit, itemType, remarks, createdById, createdByName } = req.body;
    const brands         = JSON.parse(req.body.brands         || "[]");
    const specifications = JSON.parse(req.body.specifications || "[]");
    const item_code      = await getNextItemCode(itemType || "Supply");
    let image_url        = "";
    if (req.file) {
      image_url = await uploadToStorage(
        "procurement-images",
        `items/${Date.now()}_${req.file.originalname}`,
        req.file.buffer, req.file.mimetype
      );
    }
    const { data, error } = await supabase.schema("procurement").from("items").insert({
      item_code, item_type: itemType || "Supply",
      material_name: materialName || "", make: JSON.stringify(brands),
      description: JSON.stringify(specifications), category: category || "",
      unit: unit || "", image_url,
      remarks: remarks || "",
      created_by_id: createdById || "", created_by_name: createdByName || "",
    }).select().single();
    if (error) throw error;
    res.json({ success: true, id: data.id, itemCode: item_code });
  } catch (err) {
    console.error("Item add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/items/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { materialName, category, unit, itemType, remarks } = req.body;
    const brands         = JSON.parse(req.body.brands         || "[]");
    const specifications = JSON.parse(req.body.specifications || "[]");
    let image_url        = normalizeStoragePath(req.body.imageUrl, "procurement-images") || "";

    if (req.file) {
      if (req.body.imageUrl) {
        await removeStorageFile(supabase, "procurement-images", req.body.imageUrl)
          .catch(err => console.warn("Item image cleanup failed:", err.message));
      }
      image_url = await uploadToStorage(
        "procurement-images",
        `items/${Date.now()}_${req.file.originalname}`,
        req.file.buffer, req.file.mimetype
      );
    }

    const { error } = await supabase.schema("procurement").from("items").update({
      item_type: itemType || "Supply",
      material_name: materialName || "", make: JSON.stringify(brands),
      description: JSON.stringify(specifications), category: category || "",
      unit: unit || "", image_url,
      remarks: remarks || "",
    }).eq("id", id);
    if (error) throw error;
    res.json({ success: true, imageUrl: image_url });
  } catch (err) {
    console.error("Item update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/items/:id/append-array", async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;
    
    if (!value || !value.trim()) return res.json({ success: true });

    const { data: item } = await supabase.schema("procurement").from("items").select(field).eq("id", id).single();
    if (!item) throw new Error("Item not found");

    let currentArr = [];
    try { currentArr = JSON.parse(item[field] || "[]"); } catch { currentArr = []; }

    if (!currentArr.includes(value.trim())) {
      currentArr.push(value.trim());
      const { error } = await supabase.schema("procurement").from("items").update({
        [field]: JSON.stringify(currentArr)
      }).eq("id", id);
      if (error) throw error;
    }

    res.json({ success: true, updatedArray: currentArr });
  } catch (err) {
    console.error("Append array error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/items/:id/update-array-item", async (req, res) => {
  try {
    const { id } = req.params;
    const { field, oldValue, newValue } = req.body;
    
    if (!newValue || !newValue.trim()) return res.status(400).json({ error: "New value is required" });

    const { data: item } = await supabase.schema("procurement").from("items").select(field).eq("id", id).single();
    if (!item) throw new Error("Item not found");

    let currentArr = [];
    try { currentArr = JSON.parse(item[field] || "[]"); } catch { currentArr = []; }

    const idx = currentArr.indexOf(oldValue);
    if (idx !== -1) {
      currentArr[idx] = newValue.trim();
      const { error } = await supabase.schema("procurement").from("items").update({
        [field]: JSON.stringify(currentArr)
      }).eq("id", id);
      if (error) throw error;
    }

    res.json({ success: true, updatedArray: currentArr });
  } catch (err) {
    console.error("Update array item error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await supabase.schema("procurement").from("items").select("image_url").eq("id", id).single();
    if (data?.image_url) {
      await removeStorageFile(supabase, "procurement-images", data.image_url)
        .catch(err => console.warn("Item image cleanup failed:", err.message));
    }
    const { error } = await supabase.schema("procurement").from("items").delete().eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Item delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/items/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows?.length) return res.status(400).json({ error: "No rows provided" });

    // Fetch existing item names + all codes for auto-numbering (separate per type)
    const { data: allItems } = await supabase.schema("procurement").from("items").select("material_name, item_type, item_code");
    const existingNames = new Set(
      (allItems || []).map(r => `${r.item_type}__${r.material_name.trim().toLowerCase()}`)
    );

    // Build per-type next counters
    const supplyNums = (allItems || []).filter(r => r.item_type !== "SITC").map(r => parseInt((r.item_code || "").replace("ITM-", "")) || 0);
    const sitcNums   = (allItems || []).filter(r => r.item_type === "SITC").map(r => parseInt((r.item_code || "").replace("SIT-", "")) || 0);
    let nextSupply = supplyNums.length ? Math.max(...supplyNums) + 1 : 1;
    let nextSITC   = sitcNums.length   ? Math.max(...sitcNums)   + 1 : 1;

    const newRows = rows.filter(r => {
      const key = `${r.itemType || "Supply"}__${(r.materialName || "").trim().toLowerCase()}`;
      return r.materialName?.trim() && !existingNames.has(key);
    });
    const skipped = rows.length - newRows.length;
    if (!newRows.length) return res.json({ success: true, inserted: 0, skipped });

    const inserts = newRows.map(r => {
      const type   = r.itemType || "Supply";
      const isSITC = type === "SITC";
      const code   = isSITC ? `SIT-${String(nextSITC++).padStart(3,"0")}` : `ITM-${String(nextSupply++).padStart(3,"0")}`;
      return {
        item_code:     code,
        item_type:     r.itemType      || "Supply",
        material_name: r.materialName  || "",
        make:          JSON.stringify(Array.isArray(r.brands) ? r.brands.filter(Boolean) : []),
        description:   JSON.stringify(Array.isArray(r.specifications) ? r.specifications.filter(Boolean) : []),
        category:      r.category      || "",
        unit:          r.unit          || "",
        remarks:       r.remarks       || "",
        image_url:     "",
        created_by_id: req.body.createdById || null,
        created_by_name: req.body.createdByName || "Bulk Upload",
      };
    });

    const { error } = await supabase.schema("procurement").from("items").insert(inserts);
    if (error) throw error;
    res.json({ success: true, inserted: inserts.length, skipped });
  } catch (err) {
    console.error("Bulk items error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   CLAUSES  (TC / PAY / GOV / ANX)
════════════════════════════════════ */

const getClausePrefix = (type) => ({
  TC: "TC",
  PAY: "PAY",
  GOV: "GOV",
  ANX: "ANX",
}[type] || "TC");

/* helper: next clause code per type */
const getNextClauseCode = async (type) => {
  const prefix = getClausePrefix(type);
  const { data } = await supabase.schema("procurement").from("clauses")
    .select("code").eq("type", type);
  const nums = (data || []).map(r => parseInt((r.code || "").replace(`${prefix}-`, "")) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
};

router.get("/clauses", async (req, res) => {
  try {
    const { type, allVersions } = req.query;

    if (allVersions === "true") {
      // Fetch all historical versions
      let query = supabase.schema("procurement").from("clause_versions")
        .select(`
          id, version, title, category, points, edited_by, edited_at,
          clause_ref:clauses!clause_id(code, type)
        `)
        .order("edited_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Filter by type if provided (inner filter since we join)
      const filtered = (data || []).map(v => ({
        id:        v.id,
        isVersion: true,
        version:   v.version,
        code:      v.clause_ref?.code || "VER",
        type:      v.clause_ref?.type || "TC",
        category:  normalizeNbsp(v.category || ""),
        // Formatted title for dropdown
        title:     `${normalizeNbsp(v.title)} (V${v.version})`,
        points:    sanitizeRichTextDeep(Array.isArray(v.points) ? v.points : []),
        createdAt: v.edited_at,
        createdByName: normalizeNbsp(v.edited_by || "Unknown"),
      })).filter(v => !type || v.type === type);

      return res.json({ clauses: filtered });
    }

    let query = supabase.schema("procurement").from("clauses")
      .select("*").order("code", { ascending: true });
    if (type) query = query.eq("type", type);
    const { data, error } = await query;
    if (error) throw error;
    const clauses = (data || []).map(r => ({
      id:        r.id,
      code:      r.code,
      type:      r.type,
      category:  normalizeNbsp(r.category || ""),
      title:     normalizeNbsp(r.title),
      points:    sanitizeRichTextDeep(Array.isArray(r.points) ? r.points : []),
      createdAt: r.created_at,
      createdById: r.created_by_id || "",
      createdByName: normalizeNbsp(r.created_by_name || ""),
    }));
    res.json({ clauses });
  } catch (err) {
    console.error("Clauses read error:", err.message);
    res.json({ clauses: [] });
  }
});

router.post("/clauses", async (req, res) => {
  try {
    const { type, category, title, points, editedBy, createdById, createdByName } = req.body;
    if (!type || !title) return res.status(400).json({ error: "type and title required" });
    const code = await getNextClauseCode(type);
    const pts  = sanitizeRichTextDeep(Array.isArray(points) ? points : []);
    const cleanCategory = normalizeNbsp(category || "");
    const cleanTitle = normalizeNbsp(title);
    const cleanEditedBy = normalizeNbsp(editedBy || "Unknown");
    const cleanCreatedByName = normalizeNbsp(createdByName || "");
    const { data, error } = await supabase.schema("procurement").from("clauses").insert({
      code, type,
      category: cleanCategory,
      title: cleanTitle,
      points: pts,
      created_by_id: createdById || "",
      created_by_name: cleanCreatedByName,
    }).select().single();
    if (error) throw error;
    /* save version 1 */
    try {
      await supabase.schema("procurement").from("clause_versions").insert({
        clause_id: data.id, version: 1,
        title: cleanTitle, category: cleanCategory, points: pts,
        edited_by: cleanEditedBy,
      });
    } catch (ve) { console.warn("Version save skipped:", ve.message); }
    res.json({ success: true, id: data.id, code });
  } catch (err) {
    console.error("Clause add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/clauses/:id", async (req, res) => {
  try {
    const { category, title, points, editedBy } = req.body;
    const pts = sanitizeRichTextDeep(Array.isArray(points) ? points : []);
    const cleanCategory = normalizeNbsp(category || "");
    const cleanTitle = normalizeNbsp(title);
    const cleanEditedBy = normalizeNbsp(editedBy || "Unknown");

    // Self-healing: if no version exists (e.g. old bulk uploads), save current state as v1 before updating
    const { data: currentData } = await supabase.schema("procurement").from("clauses").select("*").eq("id", req.params.id).single();
    const { data: vData } = await supabase.schema("procurement").from("clause_versions").select("version").eq("clause_id", req.params.id).order("version", { ascending: false });
    
    if ((!vData || vData.length === 0) && currentData) {
      await supabase.schema("procurement").from("clause_versions").insert({
        clause_id: req.params.id, version: 1,
        title: currentData.title, category: currentData.category || "", points: currentData.points || [],
        edited_by: "System (Original Recovered)",
      });
    }

    const { error } = await supabase.schema("procurement").from("clauses").update({
      category: cleanCategory,
      title: cleanTitle,
      points: pts,
    }).eq("id", req.params.id);
    if (error) throw error;
    
    /* save new version */
    try {
      const nextVer = vData?.length ? vData[0].version + 1 : 2;
      await supabase.schema("procurement").from("clause_versions").insert({
        clause_id: req.params.id, version: nextVer,
        title: cleanTitle, category: cleanCategory, points: pts,
        edited_by: cleanEditedBy,
      });
    } catch (ve) { console.warn("Version save skipped:", ve.message); }
    res.json({ success: true });
  } catch (err) {
    console.error("Clause update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/clauses/:id/versions", async (req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement").from("clause_versions")
      .select("*").eq("clause_id", req.params.id).order("version", { ascending: true });
    if (error) throw error;
    const versions = (data || []).map(v => ({
      id:       v.id,
      version:  v.version,
      title:    normalizeNbsp(v.title),
      category: normalizeNbsp(v.category || ""),
      points:   sanitizeRichTextDeep(Array.isArray(v.points) ? v.points : []),
      editedBy: normalizeNbsp(v.edited_by),
      editedAt: v.edited_at,
    }));
    res.json({ versions });
  } catch (err) {
    console.error("Clause versions error:", err.message);
    res.json({ versions: [] });
  }
});

router.delete("/clauses/versions/:versionId", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("clause_versions").delete().eq("id", req.params.versionId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Clause version delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


router.delete("/clauses/:id", async (req, res) => {
  try {
    /* Delete all versions associated with this clause */
    try {
      await supabase.schema("procurement").from("clause_versions").delete().eq("clause_id", req.params.id);
    } catch (ve) { console.warn("Failed to delete versions:", ve.message); }
    
    /* Finally delete the clause */
    const { error } = await supabase.schema("procurement").from("clauses").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Clause delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/clauses/bulk", async (req, res) => {
  try {
    const { rows, type } = req.body;
    if (!rows?.length) return res.status(400).json({ error: "No rows provided" });
    const prefix = getClausePrefix(type);

    const { data: existing } = await supabase.schema("procurement").from("clauses")
      .select("title, type").eq("type", type);
    const existingKeys = new Set((existing || []).map(r => normalizeNbsp(r.title || "").trim().toLowerCase()));

    const { data: allCodes } = await supabase.schema("procurement").from("clauses")
      .select("code").eq("type", type);
    const nums = (allCodes || []).map(r => parseInt((r.code || "").replace(`${prefix}-`, "")) || 0);
    let nextNum = nums.length ? Math.max(...nums) + 1 : 1;

    const cleanRows = sanitizeRichTextDeep(rows || []);
    const newRows = cleanRows.filter(r => r.title?.trim() && !existingKeys.has(r.title.trim().toLowerCase()));
    const skipped = rows.length - newRows.length;
    if (!newRows.length) return res.json({ success: true, inserted: 0, skipped });

    const inserts = newRows.map(r => ({
      code:     `${prefix}-${String(nextNum++).padStart(3, "0")}`,
      type,
      category: r.category || "",
      title:    r.title    || "",
      points:   Array.isArray(r.points) ? r.points : [],
      created_by_id: req.body.createdById || null,
      created_by_name: req.body.createdByName || "Bulk Upload",
    }));

    const { data: insertedRows, error } = await supabase.schema("procurement").from("clauses").insert(inserts).select();
    if (error) throw error;

    if (insertedRows && insertedRows.length > 0) {
      const versionInserts = insertedRows.map(row => ({
        clause_id: row.id,
        version: 1,
        title: row.title,
        category: row.category || "",
        points: row.points || [],
        edited_by: "System (Bulk Upload)",
      }));
      // Manually record version 1 for all bulk uploaded items
      await supabase.schema("procurement").from("clause_versions").insert(versionInserts);
    }

    res.json({ success: true, inserted: inserts.length, skipped });
  } catch (err) {
    console.error("Clause bulk error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   VENDORS
════════════════════════════════════ */

const vendorUpload = upload.fields([
  { name: "logo",            maxCount: 1 },
  { name: "docGst",          maxCount: 1 },
  { name: "docPan",          maxCount: 1 },
  { name: "docAadhaar",      maxCount: 1 },
  { name: "docCoi",          maxCount: 1 },
  { name: "docMsme",         maxCount: 1 },
  { name: "docCancelCheque", maxCount: 1 },
  { name: "docOther",        maxCount: 1 },
  { name: "docOther2",       maxCount: 1 },
]);

const uploadVendorFile = async (files, key, folder) => {
  if (!files?.[key]) return null;
  const file = files[key][0];
  return await uploadToStorage(
    "vendor-docs",
    `${folder}/${key}_${Date.now()}_${file.originalname}`,
    file.buffer, file.mimetype
  );
};

/* helper: next vendor_code (VEN-001, VEN-002...) */
const getNextVendorCode = async () => {
  const { data } = await supabase.schema("procurement")
    .from("vendors").select("vendor_code");
  const nums = (data || [])
    .map(r => parseInt((r.vendor_code || "").replace("VEN-", "")) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `VEN-${String(next).padStart(3, "0")}`;
};

router.get("/vendors", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("vendors").select("*").is("deleted_at", null).order("vendor_code", { ascending: true });
    if (error) throw error;

    const userIds = [...new Set((data || []).map(r => r.created_by_id).filter(Boolean))];
    const userNameById = new Map();
    if (userIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", userIds);
      (users || []).forEach(u => userNameById.set(u.id, u.name || u.email || ""));
    }

    const vendors = await Promise.all((data || []).map(async r => {
      const [
        logoUrl,
        docGstUrl,
        docPanUrl,
        docAadhaarUrl,
        docCoiUrl,
        docMsmeUrl,
        docCancelChequeUrl,
        docOtherUrl,
        docOther2Url,
      ] = await Promise.all([
        r.logo_url,
        r.doc_gst_url,
        r.doc_pan_url,
        r.doc_aadhaar_url,
        r.doc_coi_url,
        r.doc_msme_url,
        r.doc_cancel_cheque_url,
        r.doc_other_url,
        r.doc_other2_url,
      ].map(signVendorDocUrl));

      return {
        id:             r.id,
        vendorCode:     r.vendor_code     || "",
        vendorName:     r.vendor_name     || "",
        address:        r.address         || "",
        bankName:       r.bank_name       || "",
        accountHolder:  r.account_holder  || "",
        accountNumber:  r.account_number  || "",
        ifscCode:       r.ifsc_code       || "",
        bankBranch:     r.bank_branch     || "",
        bankCity:       r.bank_city       || "",
        bankState:      r.bank_state      || "",
        gstin:          r.gstin           || "",
        msmeNumber:     r.msme_number     || "",
        pan:            r.pan             || "",
        aadharNo:       r.aadhar_no       || "",
        contactPerson:  r.contact_person  || "",
        mobile:         r.mobile          || "",
        email:          r.email           || "",
        companyCodes:   parseJsonArr(r.company_codes).map(x => String(x || "").trim()).filter(Boolean),
        logoUrl,
        docGstUrl,
        docPanUrl,
        docAadhaarUrl,
        docCoiUrl,
        docMsmeUrl,
        docCancelChequeUrl,
        docOtherUrl,
        docOther2Url,
        siteCodes:           parseJsonArr(r.site_codes),
        createdById:         r.created_by_id         || "",
        createdByName:       r.created_by_name       || userNameById.get(r.created_by_id) || "",
        createdAt:           r.created_at            || "",
      };
    }));
    res.json({ vendors });
  } catch (err) {
    console.error("Vendors read error:", err.message);
    res.json({ vendors: [] });
  }
});

router.post("/vendors", vendorUpload, async (req, res) => {
  try {
    const b = req.body;
    const files = req.files || {};
    const folder = b.vendorName || "vendor";

    const [logoUrl, docGstUrl, docPanUrl, docAadhaarUrl, docCoiUrl, docMsmeUrl, docCancelChequeUrl, docOtherUrl, docOther2Url] = await Promise.all([
      uploadVendorFile(files, "logo",            folder),
      uploadVendorFile(files, "docGst",          folder),
      uploadVendorFile(files, "docPan",          folder),
      uploadVendorFile(files, "docAadhaar",      folder),
      uploadVendorFile(files, "docCoi",          folder),
      uploadVendorFile(files, "docMsme",         folder),
      uploadVendorFile(files, "docCancelCheque", folder),
      uploadVendorFile(files, "docOther",        folder),
      uploadVendorFile(files, "docOther2",       folder),
    ]);

    const buildPayload = (vendorCode) => ({
      vendor_code:     vendorCode,
      vendor_name:     b.vendorName     || "",
      address:         b.address        || "",
      bank_name:       b.bankName       || "",
      account_holder:  b.accountHolder  || "",
      account_number:  b.accountNumber  || "",
      ifsc_code:       b.ifscCode       || "",
      bank_branch:     b.bankBranch     || "",
      bank_city:       b.bankCity       || "",
      bank_state:      b.bankState      || "",
      gstin:           b.gstin          || "",
      msme_number:     b.msmeNumber     || "",
      pan:             b.pan            || "",
      aadhar_no:       b.aadharNo       || "",
      contact_person:  b.contactPerson  || "",
      mobile:          b.mobile         || "",
      email:           b.email          || "",
      company_codes:   JSON.stringify(parseJsonArr(req.body.companyCodes).map(x => String(x || "").trim()).filter(Boolean)),
      logo_url:              logoUrl             || "",
      doc_gst_url:           docGstUrl           || "",
      doc_pan_url:           docPanUrl           || "",
      doc_aadhaar_url:       docAadhaarUrl       || "",
      doc_coi_url:           docCoiUrl           || "",
      doc_msme_url:          docMsmeUrl          || "",
      doc_cancel_cheque_url: docCancelChequeUrl  || "",
      doc_other_url:         docOtherUrl         || "",
      doc_other2_url:        docOther2Url        || "",
      site_codes:            req.body.siteCodes  || "[]",
      created_by_id:         b.createdById       || "",
      created_by_name:       b.createdByName     || "",
    });

    let data, lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const vendorCode = await getNextVendorCode();
      const result = await supabase.schema("procurement").from("vendors").insert(buildPayload(vendorCode)).select().single();
      if (!result.error) { data = result.data; lastErr = null; break; }
      lastErr = result.error;
      // retry only on unique violation (race condition on vendor_code)
      if (result.error.code !== "23505") break;
    }
    if (!data) throw lastErr || new Error("Failed to insert vendor");
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error("Vendor add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/vendors/:id", vendorUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const files = req.files || {};
    const folder = b.vendorName || "vendor";

    const [newLogo, newDocGst, newDocPan, newDocAadhaar, newDocCoi, newDocMsme, newDocCancelCheque, newDocOther, newDocOther2] = await Promise.all([
      uploadVendorFile(files, "logo",            folder),
      uploadVendorFile(files, "docGst",          folder),
      uploadVendorFile(files, "docPan",          folder),
      uploadVendorFile(files, "docAadhaar",      folder),
      uploadVendorFile(files, "docCoi",          folder),
      uploadVendorFile(files, "docMsme",         folder),
      uploadVendorFile(files, "docCancelCheque", folder),
      uploadVendorFile(files, "docOther",        folder),
      uploadVendorFile(files, "docOther2",       folder),
    ]);

    const { error } = await supabase.schema("procurement").from("vendors").update({
      vendor_name:     b.vendorName    || "",
      address:         b.address       || "",
      bank_name:       b.bankName       || "",
      account_holder:  b.accountHolder  || "",
      account_number:  b.accountNumber  || "",
      ifsc_code:       b.ifscCode       || "",
      bank_branch:     b.bankBranch     || "",
      bank_city:       b.bankCity       || "",
      bank_state:      b.bankState      || "",
      gstin:           b.gstin          || "",
      msme_number:     b.msmeNumber     || "",
      pan:             b.pan            || "",
      aadhar_no:       b.aadharNo       || "",
      contact_person:  b.contactPerson  || "",
      mobile:          b.mobile         || "",
      email:           b.email          || "",
      company_codes:   JSON.stringify(parseJsonArr(b.companyCodes).map(x => String(x || "").trim()).filter(Boolean)),
      logo_url:              newLogo             || normalizeStoragePath(b.logoUrl, "vendor-docs")            || "",
      doc_gst_url:           newDocGst           || normalizeStoragePath(b.docGstUrl, "vendor-docs")          || "",
      doc_pan_url:           newDocPan           || normalizeStoragePath(b.docPanUrl, "vendor-docs")          || "",
      doc_aadhaar_url:       newDocAadhaar       || normalizeStoragePath(b.docAadhaarUrl, "vendor-docs")      || "",
      doc_coi_url:           newDocCoi           || normalizeStoragePath(b.docCoiUrl, "vendor-docs")          || "",
      doc_msme_url:          newDocMsme          || normalizeStoragePath(b.docMsmeUrl, "vendor-docs")         || "",
      doc_cancel_cheque_url: newDocCancelCheque  || normalizeStoragePath(b.docCancelChequeUrl, "vendor-docs") || "",
      doc_other_url:         newDocOther         || normalizeStoragePath(b.docOtherUrl, "vendor-docs")        || "",
      doc_other2_url:        newDocOther2        || normalizeStoragePath(b.docOther2Url, "vendor-docs")       || "",
      site_codes:            b.siteCodes         || "[]",
    }).eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Vendor update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/vendors/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("vendors").update({
      deleted_at: new Date().toISOString(),
      deleted_by_id: req.body?.deletedById || req.query?.deletedById || null,
      deleted_by_name: req.body?.deletedByName || req.query?.deletedByName || "",
    }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Vendor delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/vendors/trash", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("vendors").select("id, vendor_code, vendor_name, email, mobile, gstin, deleted_at, deleted_by_id, deleted_by_name")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;

    const userIds = [...new Set((data || []).map(r => r.deleted_by_id).filter(Boolean))];
    const userNameById = new Map();
    if (userIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", userIds);
      (users || []).forEach(u => userNameById.set(u.id, u.name || u.email || ""));
    }

    res.json({
      vendors: (data || []).map(r => ({
        id: r.id,
        vendorCode: r.vendor_code || "",
        vendorName: r.vendor_name || "",
        email: r.email || "",
        mobile: r.mobile || "",
        gstin: r.gstin || "",
        deletedAt: r.deleted_at || "",
        deletedByName: r.deleted_by_name || userNameById.get(r.deleted_by_id) || "",
      })),
    });
  } catch (err) {
    console.error("Vendors trash error:", err.message);
    res.json({ vendors: [] });
  }
});

router.post("/vendors/:id/restore", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("vendors").update({
      deleted_at: null,
      deleted_by_id: null,
      deleted_by_name: null,
    }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Vendor restore error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/vendors/:id/permanent", async (req, res) => {
  try {
    const { data: vendor } = await supabase.schema("procurement").from("vendors").select("*").eq("id", req.params.id).single();
    if (vendor) {
      const urls = [
        vendor.logo_url, vendor.doc_gst_url, vendor.doc_pan_url, vendor.doc_aadhaar_url,
        vendor.doc_coi_url, vendor.doc_msme_url, vendor.doc_cancel_cheque_url,
        vendor.doc_other_url, vendor.doc_other2_url
      ];
      const paths = urls.map(url => normalizeStoragePath(url, "vendor-docs")).filter(Boolean);
      
      if (paths.length > 0) {
        await supabase.storage.from("vendor-docs").remove(paths).catch(err => console.warn("Storage cleanup failed:", err.message));
      }
    }

    const { error } = await supabase.schema("procurement").from("vendors").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Vendor permanent delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/vendors/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows?.length) return res.status(400).json({ error: "No rows provided" });
    // Pre-fetch existing for code-numbering AND dedupe
    const { data: existingV } = await supabase.schema("procurement").from("vendors")
      .select("vendor_code, vendor_name, gstin, pan");
    const existingNums = (existingV || []).map(r => parseInt((r.vendor_code || "").replace("VEN-", "")) || 0);
    let nextNum = (existingNums.length ? Math.max(...existingNums) : 0) + 1;

    const nameSet  = new Set((existingV || []).map(r => (r.vendor_name || "").trim().toLowerCase()).filter(Boolean));
    const gstinSet = new Set((existingV || []).map(r => (r.gstin || "").trim().toUpperCase()).filter(Boolean));
    const panSet   = new Set((existingV || []).map(r => (r.pan   || "").trim().toUpperCase()).filter(Boolean));

    const seenInBatch = new Set();
    let skipped = 0;
    const records = [];

    for (const r of rows) {
      const name  = (r["Vendor Firm Name"] || "").trim();
      const gstin = (r["GST No"] || "").trim().toUpperCase();
      const pan   = (r["PAN No"] || "").trim().toUpperCase();
      if (!name) { skipped++; continue; }

      const nameKey = name.toLowerCase();
      if (nameSet.has(nameKey))               { skipped++; continue; }
      if (gstin && gstinSet.has(gstin))       { skipped++; continue; }
      if (pan   && panSet.has(pan))           { skipped++; continue; }
      if (seenInBatch.has(nameKey))           { skipped++; continue; }
      seenInBatch.add(nameKey);

      const siteCodes = r["Site Codes"] || r["Site Code"] || r["siteCodes"] || r["siteCode"] || "";
      const companyCodes = r["Company Codes"] || r["Company Code"] || r["companyCodes"] || r["companyCode"] || "";
      records.push({
        vendor_code:     `VEN-${String(nextNum++).padStart(3, "0")}`,
        vendor_name:     name,
        email:           r["Email"]                  || "",
        contact_person:  r["Contact Person Name"]    || "",
        mobile:          r["Contact Person Number"]  || "",
        gstin:           r["GST No"]                 || "",
        pan:             r["PAN No"]                 || "",
        aadhar_no:       r["Aadhar No"]              || "",
        msme_number:     r["MSME Number"]            || "",
        bank_name:       r["Bank Name"]              || "",
        account_holder:  r["Account Holder"]         || "",
        account_number:  r["Account Number"]         || "",
        ifsc_code:       r["Bank IFSC"]              || "",
        bank_branch:     r["Bank Branch"]            || "",
        bank_city:       r["Bank City"]              || "",
        bank_state:      r["Bank State"]             || "",
        address:         r["Address"]                || "",
        company_codes:   JSON.stringify(companyCodes.toString().split(",").map(cc => cc.trim()).filter(Boolean)),
        site_codes:      JSON.stringify(siteCodes.toString().split(",").map(sc => sc.trim()).filter(Boolean)),
        created_by_id:   req.body.createdById        || null,
        created_by_name: req.body.createdByName      || "Bulk Upload",
      });
    }

    if (!records.length) return res.json({ success: true, inserted: 0, skipped });
    const { error } = await supabase.schema("procurement").from("vendors").insert(records);
    if (error) throw error;
    res.json({ success: true, inserted: records.length, skipped });
  } catch (err) {
    console.error("Vendor bulk error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   SITES
════════════════════════════════════ */

const parseSiteJson = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch {}
  }
  return [];
};

const missingSiteColumns = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "42703" || err?.code === "PGRST204" || msg.includes("could not find") || msg.includes("column");
};

const siteBasePayload = (b) => ({
  site_name:       b.siteName    || "",
  site_code:       b.siteCode    || "",
  city:            b.district    || b.city || "",
  state:           b.state       || "",
  site_address:    b.siteAddress || "",
  billing_address: "",
  contacts:        Array.isArray(b.contacts) ? b.contacts : parseSiteJson(b.contacts),
});

const siteFullPayload = (b) => ({
  ...siteBasePayload(b),
  district:  b.district  || "",
  pincode:   b.pincode   || "",
  status:    b.status    || "active",
  latitude:  b.latitude  || "",
  longitude: b.longitude || "",
  contacts:  Array.isArray(b.contacts) ? b.contacts : parseSiteJson(b.contacts),
  slug:      b.slug      || "",
});

router.get("/sites", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("sites").select("*").order("site_name", { ascending: true });
    if (error) throw error;
    const sites = (data || []).map(r => ({
      id:          r.id,
      siteName:    r.site_name    || "",
      siteCode:    r.site_code    || "",
      district:    r.district     || r.city || "",
      city:        r.city         || "",
      state:       r.state        || "",
      pincode:     r.pincode      || "",
      status:      r.status       || "active",
      latitude:    r.latitude     || "",
      longitude:   r.longitude    || "",
      siteAddress: r.site_address || "",
      contacts:    parseSiteJson(r.contacts),
      slug:        r.slug         || "",
    }));
    res.json({ sites });
  } catch (err) {
    console.error("Sites read error:", err.message);
    res.json({ sites: [] });
  }
});

router.post("/sites", async (req, res) => {
  try {
    const base = { ...siteBasePayload(req.body), created_by_id: req.body.createdById || null, created_by_name: req.body.createdByName || null };
    const full = { ...siteFullPayload(req.body), created_by_id: req.body.createdById || null, created_by_name: req.body.createdByName || null };
    let { data, error } = await supabase.schema("procurement").from("sites").insert(full).select().single();
    if (error && missingSiteColumns(error)) {
      ({ data, error } = await supabase.schema("procurement").from("sites").insert(base).select().single());
    }
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error("Site add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/sites/:id", async (req, res) => {
  try {
    let { error } = await supabase.schema("procurement").from("sites").update(siteFullPayload(req.body)).eq("id", req.params.id);
    if (error && missingSiteColumns(error)) {
      ({ error } = await supabase.schema("procurement").from("sites").update(siteBasePayload(req.body)).eq("id", req.params.id));
    }
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Site update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/sites/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("sites").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Site delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/sites/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows?.length) return res.status(400).json({ error: "No rows provided" });

    const { data: existing } = await supabase.schema("procurement").from("sites").select("site_code, site_name, city");
    const codeSet = new Set((existing || []).map(r => (r.site_code || "").trim().toLowerCase()).filter(Boolean));
    const nameCitySet = new Set((existing || []).map(r =>
      `${(r.site_name || "").trim().toLowerCase()}|${(r.city || "").trim().toLowerCase()}`
    ));

    const seenInBatch = new Set();
    let skipped = 0;
    const inserts = [];

    for (const r of rows) {
      const code = (r.siteCode || "").trim();
      const name = (r.siteName || "").trim();
      const city = (r.city || "").trim();
      if (!name) { skipped++; continue; }
      const codeKey = code.toLowerCase();
      const nameCityKey = `${name.toLowerCase()}|${city.toLowerCase()}`;

      if (codeKey && codeSet.has(codeKey)) { skipped++; continue; }
      if (!codeKey && nameCitySet.has(nameCityKey)) { skipped++; continue; }
      const batchKey = codeKey || nameCityKey;
      if (seenInBatch.has(batchKey)) { skipped++; continue; }
      seenInBatch.add(batchKey);

      inserts.push({
        site_name:    name,
        site_code:    code,
        city:         r.district || city,
        state:        r.state    || "",
        site_address: r.siteAddress || "",
        billing_address: "",
        district:  r.district || city,
        pincode:   r.pincode  || "",
        status:    r.status   || "active",
        slug:      r.slug     || "",
        contacts:  [],
        created_by_id:   req.body.createdById   || null,
        created_by_name: req.body.createdByName || "Bulk Upload",
      });
    }

    if (!inserts.length) return res.json({ success: true, count: 0, skipped });
    const { error } = await supabase.schema("procurement").from("sites").insert(inserts);
    if (error) throw error;
    res.json({ success: true, count: inserts.length, skipped });
  } catch (err) {
    console.error("Bulk sites error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   UOM
════════════════════════════════════ */

router.get("/uom", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("uom").select("*").order("uom_name", { ascending: true });
    if (error) throw error;
    const uoms = (data || []).map(r => ({
      id:      r.id,
      uomName: r.uom_name || "",
      uomCode: r.uom_code || "",
    }));
    res.json({ uoms });
  } catch (err) {
    console.error("UOM read error:", err.message);
    res.json({ uoms: [] });
  }
});

router.post("/uom", async (req, res) => {
  try {
    const { uomName, uomCode, createdById, createdByName } = req.body;
    const { data, error } = await supabase.schema("procurement").from("uom")
      .insert({
        uom_name: uomName || "", uom_code: uomCode || "",
        created_by_id: createdById || null,
        created_by_name: createdByName || null,
      })
      .select().single();
    if (error) throw error;
    res.json({ success: true, uom: { uomCode: data.uom_code || uomCode, uomName: data.uom_name || uomName }, id: data.id });
  } catch (err) {
    console.error("UOM add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/uom/:id", async (req, res) => {
  try {
    const { uomName, uomCode } = req.body;
    const { error } = await supabase.schema("procurement").from("uom")
      .update({ uom_name: uomName || "", uom_code: uomCode || "" })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("UOM update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/uom/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("uom").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("UOM delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/uom/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows?.length) return res.status(400).json({ error: "No rows provided" });

    const { data: existing } = await supabase.schema("procurement").from("uom").select("uom_code, uom_name");
    const codeSet = new Set((existing || []).map(r => (r.uom_code || "").trim().toLowerCase()).filter(Boolean));
    const nameSet = new Set((existing || []).map(r => (r.uom_name || "").trim().toLowerCase()).filter(Boolean));

    const seenInBatch = new Set();
    let skipped = 0;
    const inserts = [];

    for (const r of rows) {
      const name = (r.uomName || "").trim();
      const code = (r.uomCode || "").trim();
      if (!name) { skipped++; continue; }
      const nameKey = name.toLowerCase();
      const codeKey = code.toLowerCase();

      if (codeKey && codeSet.has(codeKey)) { skipped++; continue; }
      if (nameSet.has(nameKey)) { skipped++; continue; }
      const batchKey = codeKey || nameKey;
      if (seenInBatch.has(batchKey)) { skipped++; continue; }
      seenInBatch.add(batchKey);

      inserts.push({
        uom_name: name,
        uom_code: code,
        created_by_id: req.body.createdById || null,
        created_by_name: req.body.createdByName || "Bulk Upload",
      });
    }

    if (!inserts.length) return res.json({ success: true, count: 0, skipped });
    const { error } = await supabase.schema("procurement").from("uom").insert(inserts);
    if (error) throw error;
    res.json({ success: true, count: inserts.length, skipped });
  } catch (err) {
    console.error("Bulk UOM error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   CATEGORIES
════════════════════════════════════ */

/* helper: fetch all existing categories and return next auto code */
const getNextCategoryCode = async () => {
  const { data } = await supabase.schema("procurement").from("categories").select("category_code");
  const nums = (data || [])
    .map(r => parseInt((r.category_code || "").replace("CAT-", "")) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `CAT-${String(next).padStart(3, "0")}`;
};

router.get("/categories", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("categories").select("*").order("category_code", { ascending: true });
    if (error) throw error;
    const categories = (data || []).map(r => ({
      id:           r.id,
      categoryCode: r.category_code || "",
      categoryName: r.category_name || "",
      description:  r.description   || "",
      status:       r.status        || "Active",
    }));
    res.json({ categories });
  } catch (err) {
    console.error("Categories read error:", err.message);
    res.json({ categories: [] });
  }
});

/* bulk — skips duplicates by category_name (case-insensitive) */
router.post("/categories/bulk", async (req, res) => {
  try {
    const { rows } = req.body;
    // fetch existing names to deduplicate
    const { data: existing } = await supabase.schema("procurement").from("categories").select("category_name, category_code");
    const existingNames = new Set((existing || []).map(r => (r.category_name || "").trim().toLowerCase()));
    const existingCodes = new Set((existing || []).map(r => (r.category_code || "").trim().toUpperCase()));
    // get existing nums to auto-assign new codes
    const nums = (existing || []).map(r => parseInt((r.category_code || "").replace("CAT-", "")) || 0);
    let nextNum = nums.length ? Math.max(...nums) + 1 : 1;

    const newRows = rows.filter(r => !existingNames.has(r.categoryName.trim().toLowerCase()));
    if (!newRows.length) {
      return res.json({ success: true, count: 0, skipped: rows.length });
    }

    const inserts = newRows.map(r => {
      // use code from CSV if provided and not duplicate, else auto-generate
      let code = (r.categoryCode || "").trim().toUpperCase();
      if (!code || existingCodes.has(code)) {
        code = `CAT-${String(nextNum).padStart(3, "0")}`;
        nextNum++;
      }
      existingCodes.add(code);
      return {
        category_code: code,
        category_name: r.categoryName || "",
        description:   r.description  || "",
        status:        r.status       || "Active",
        created_by_id: req.body.createdById || null,
        created_by_name: req.body.createdByName || "Bulk Upload",
      };
    });

    const { error } = await supabase.schema("procurement").from("categories").insert(inserts);
    if (error) throw error;
    res.json({ success: true, count: inserts.length, skipped: rows.length - inserts.length });
  } catch (err) {
    console.error("Bulk categories error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/categories", async (req, res) => {
  try {
    const { categoryName, description, status, createdById, createdByName } = req.body;
    const categoryCode = await getNextCategoryCode();
    const { data, error } = await supabase.schema("procurement").from("categories")
      .insert({
        category_code: categoryCode, category_name: categoryName || "", description: description || "", status: status || "Active",
        created_by_id: createdById || null,
        created_by_name: createdByName || null,
      })
      .select().single();
    if (error) throw error;
    res.json({ success: true, id: data.id, categoryCode });
  } catch (err) {
    console.error("Category add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/categories/:id", async (req, res) => {
  try {
    const { categoryName, description, status } = req.body;
    const { error } = await supabase.schema("procurement").from("categories")
      .update({ category_name: categoryName || "", description: description || "", status: status || "Active" })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Category update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("categories").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Category delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   COMPANIES
════════════════════════════════════ */

const companyUpload = upload.fields([
  { name: "logo",  maxCount: 1 },
  { name: "stamp", maxCount: 1 },
  { name: "sign",  maxCount: 1 },
]);

const uploadCompanyImg = async (files, key, folder) => {
  if (!files?.[key]) return null;
  const file = files[key][0];
  return await uploadToStorage(
    "procurement-images",
    `companies/${folder}/${key}_${Date.now()}_${file.originalname}`,
    file.buffer, file.mimetype
  );
};

const parseCompanyJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const missingCompanyExtraColumns = (error) => {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42703" || error?.code === "PGRST204" || msg.includes("could not find") || msg.includes("column");
};

const companyExtraPayload = (b) => ({
  status: b.status || "active",
  billing_gstin: b.billingGstin || "",
  billing_contact_name: b.billingContactName || "",
  billing_contact_phone: b.billingContactPhone || "",
  billing_state: b.billingState || "",
  billing_address: b.billingAddress || "",
  account_no: b.accountNo || "",
  account_holder_name: b.accountHolderName || "",
  ifsc_code: b.ifscCode || "",
  bank_name: b.bankName || "",
  bank_branch: b.bankBranch || "",
  bank_city: b.bankCity || "",
  bank_state: b.bankState || "",
  state_billing_profiles: parseCompanyJsonArray(b.stateBillingProfiles),
});

router.get("/companies", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("companies").select("*").order("company_name", { ascending: true });
    if (error) throw error;
    const companies = await Promise.all((data || []).map(async r => {
      const [logoUrl, stampUrl, signUrl] = await Promise.all([
        r.logo_url,
        r.stamp_url,
        r.sign_url,
      ].map(signProcurementImageUrl));

      return {
        id:          r.id,
        companyName:  r.company_name  || "",
        companyCode:  r.company_code  || "",
        personName:   r.person_name   || "",
        designation:  r.designation   || "",
        phone:        r.phone         || "",
        email:        r.email         || "",
        gstin:        r.gstin         || "",
        pan:          r.pan           || "",
        pincode:      r.pincode       || "",
        state:        r.state         || "",
        district:     r.district      || "",
        address:      r.address       || "",
        status:       r.status        || "active",
        billingGstin:        r.billing_gstin         || "",
        billingContactName:  r.billing_contact_name  || "",
        billingContactPhone: r.billing_contact_phone || "",
        billingState:        r.billing_state         || "",
        billingAddress:      r.billing_address       || "",
        accountNo:           r.account_no            || "",
        accountHolderName:   r.account_holder_name   || "",
        ifscCode:            r.ifsc_code             || "",
        bankName:            r.bank_name             || "",
        bankBranch:          r.bank_branch           || "",
        bankCity:            r.bank_city             || "",
        bankState:           r.bank_state            || "",
        stateBillingProfiles: parseCompanyJsonArray(r.state_billing_profiles),
        logoPath: normalizeStoragePath(r.logo_url, "procurement-images") || "",
        stampPath: normalizeStoragePath(r.stamp_url, "procurement-images") || "",
        signPath: normalizeStoragePath(r.sign_url, "procurement-images") || "",
        logoUrl,
        stampUrl,
        signUrl,
      };
    }));
    res.json({ companies });
  } catch (err) {
    console.error("Companies read error:", err.message);
    res.json({ companies: [] });
  }
});

router.post("/companies", companyUpload, async (req, res) => {
  try {
    const b = req.body;
    const files = req.files || {};
    const folder = b.companyCode || b.companyName || "company";

    const [logoUrl, stampUrl, signUrl] = await Promise.all([
      uploadCompanyImg(files, "logo",  folder),
      uploadCompanyImg(files, "stamp", folder),
      uploadCompanyImg(files, "sign",  folder),
    ]);

    const basePayload = {
      company_name: b.companyName || "", company_code: b.companyCode || "",
      person_name: b.personName || "", designation: b.designation || "",
      phone: b.phone || "", email: b.email || "",
      gstin: b.gstin || "", pan: b.pan || "",
      pincode: b.pincode || "", state: b.state || "",
      district: b.district || "", address: b.address || "",
      logo_url:  logoUrl  || "",
      stamp_url: stampUrl || "",
      sign_url:  signUrl  || "",
      created_by_id: b.createdById || null,
      created_by_name: b.createdByName || null,
    };
    const fullPayload = { ...basePayload, ...companyExtraPayload(b) };
    let { data, error } = await supabase.schema("procurement").from("companies").insert(fullPayload).select().single();
    if (error && missingCompanyExtraColumns(error)) {
      console.warn("Company extra columns missing; saving base entity fields only. Apply company entity migration.");
      ({ data, error } = await supabase.schema("procurement").from("companies").insert(basePayload).select().single());
    }
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error("Company add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/companies/:id", companyUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const files = req.files || {};
    const folder = b.companyCode || b.companyName || "company";

    const [newLogo, newStamp, newSign] = await Promise.all([
      uploadCompanyImg(files, "logo",  folder),
      uploadCompanyImg(files, "stamp", folder),
      uploadCompanyImg(files, "sign",  folder),
    ]);

    const basePayload = {
      company_name: b.companyName || "", company_code: b.companyCode || "",
      person_name: b.personName || "", designation: b.designation || "",
      phone: b.phone || "", email: b.email || "",
      gstin: b.gstin || "", pan: b.pan || "",
      pincode: b.pincode || "", state: b.state || "",
      district: b.district || "", address: b.address || "",
      logo_url:  newLogo  || normalizeStoragePath(b.logoUrl, "procurement-images")  || "",
      stamp_url: newStamp || normalizeStoragePath(b.stampUrl, "procurement-images") || "",
      sign_url:  newSign  || normalizeStoragePath(b.signUrl, "procurement-images")  || "",
    };
    const fullPayload = { ...basePayload, ...companyExtraPayload(b) };
    let { error } = await supabase.schema("procurement").from("companies").update(fullPayload).eq("id", id);
    if (error && missingCompanyExtraColumns(error)) {
      console.warn("Company extra columns missing; updating base entity fields only. Apply company entity migration.");
      ({ error } = await supabase.schema("procurement").from("companies").update(basePayload).eq("id", id));
    }
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Company update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("companies").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Company delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════
   CONTACTS
══════════════════════════════════════════ */
/* helper: next contact_code (CON-001, CON-002...) */
const getNextContactCode = async () => {
  const { data } = await supabase.schema("procurement")
    .from("contacts").select("contact_code");
  const nums = (data || [])
    .map(r => parseInt((r.contact_code || "").replace("CON-", "")) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `CON-${String(next).padStart(3, "0")}`;
};

const missingContactColumn = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "42703" || err?.code === "PGRST204" || msg.includes("could not find") || msg.includes("column");
};

router.get("/contacts", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("contacts").select("*").order("contact_code", { ascending: true });
    if (error) throw error;
    const contacts = (data || []).map(r => ({
      id:             r.id,
      contactCode:    r.contact_code    || "",
      personName:     r.person_name     || "",
      contactNumber:  r.contact_number  || "",
      designation:    r.designation     || "",
      company:        r.company         || "",
      email:          r.email           || "",
      department:     r.department      || "",
      reportingTo:    r.reporting_to    || "",
      status:         r.status          || "active",
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
    }));
    res.json({ contacts });
  } catch (err) {
    console.error("Contacts read error:", err.message);
    res.json({ contacts: [] });
  }
});

router.post("/contacts", async (req, res) => {
  try {
    const { personName, contactNumber, designation, company, email, department, reportingTo, status,
            workLocation, role, team, bio, tags, employeeId,
            dateOfBirth, gender, maritalStatus, nationality,
            alternatePhone, address, joiningDate,
            createdById, createdByName } = req.body;
    // Duplicate check: same employee_id already exists → skip
    if (employeeId && employeeId.trim()) {
      const { data: existing } = await supabase.schema("procurement").from("contacts")
        .select("id")
        .eq("employee_id", employeeId.trim())
        .maybeSingle();
      if (existing) return res.status(409).json({ duplicate: true, message: "Contact already exists" });
    }

    const contactCode = await getNextContactCode();
    const fullPayload = {
      contact_code:    contactCode,
      person_name:     personName     || "",
      contact_number:  contactNumber  || "",
      designation:     designation    || "",
      company:         company        || "",
      email:           email          || "",
      department:      department     || "",
      reporting_to:    reportingTo    || "",
      status:          status         || "active",
      work_location:   workLocation   || "",
      role:            role           || "",
      team:            team           || "",
      bio:             bio            || "",
      tags:            tags           || "",
      employee_id:     employeeId     || "",
      date_of_birth:   dateOfBirth    || null,
      gender:          gender         || "",
      marital_status:  maritalStatus  || "",
      nationality:     nationality    || "",
      alternate_phone: alternatePhone || "",
      address:         address        || "",
      joining_date:    joiningDate    || null,
      created_by_id:   createdById    || null,
      created_by_name: createdByName  || null,
    };
    const basePayload = { ...fullPayload };
    delete basePayload.email;
    delete basePayload.department;
    delete basePayload.reporting_to;
    delete basePayload.status;
    delete basePayload.work_location;
    delete basePayload.role;
    delete basePayload.team;
    delete basePayload.bio;
    delete basePayload.tags;
    delete basePayload.employee_id;
    delete basePayload.date_of_birth;
    delete basePayload.gender;
    delete basePayload.marital_status;
    delete basePayload.nationality;
    delete basePayload.alternate_phone;
    delete basePayload.address;
    delete basePayload.joining_date;

    let { data, error } = await supabase.schema("procurement").from("contacts").insert(fullPayload).select().single();
    if (error && missingContactColumn(error)) {
      ({ data, error } = await supabase.schema("procurement").from("contacts").insert(basePayload).select().single());
    }
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error("Contact add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/contacts/:id", async (req, res) => {
  try {
    const { personName, contactNumber, designation, company, email, department, reportingTo, status,
            workLocation, role, team, bio, tags, employeeId,
            dateOfBirth, gender, maritalStatus, nationality,
            alternatePhone, address, joiningDate } = req.body;
    const fullUpdate = {
      person_name:     personName     || "",
      contact_number:  contactNumber  || "",
      designation:     designation    || "",
      company:         company        || "",
      email:           email          || "",
      department:      department     || "",
      reporting_to:    reportingTo    || "",
      status:          status         || "active",
      work_location:   workLocation   || "",
      role:            role           || "",
      team:            team           || "",
      bio:             bio            || "",
      tags:            tags           || "",
      employee_id:     employeeId     || "",
      date_of_birth:   dateOfBirth    || null,
      gender:          gender         || "",
      marital_status:  maritalStatus  || "",
      nationality:     nationality    || "",
      alternate_phone: alternatePhone || "",
      address:         address        || "",
      joining_date:    joiningDate    || null,
    };
    const baseUpdate = { person_name: fullUpdate.person_name, contact_number: fullUpdate.contact_number, designation: fullUpdate.designation, company: fullUpdate.company };

    let { error } = await supabase.schema("procurement").from("contacts").update(fullUpdate).eq("id", req.params.id);
    if (error && missingContactColumn(error)) {
      ({ error } = await supabase.schema("procurement").from("contacts").update(baseUpdate).eq("id", req.params.id));
    }
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Contact update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/contacts/:id/profile-image", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No image provided" });

    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const storagePath = `contact-profiles/${id}.${ext}`;

    await uploadToStorage("procurement-images", storagePath, req.file.buffer, req.file.mimetype);

    let { error } = await supabase.schema("procurement").from("contacts")
      .update({ profile_image: storagePath }).eq("id", id);
    if (error && missingContactColumn(error)) {
      return res.json({ success: true, path: storagePath });
    }
    if (error) throw error;
    res.json({ success: true, path: storagePath });
  } catch (err) {
    console.error("Contact image upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/contacts/:id/profile-image", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: contact, error: fetchError } = await supabase.schema("procurement").from("contacts").select("profile_image").eq("id", id).single();
    if (fetchError) throw fetchError;
    if (contact?.profile_image) {
      await removeFromStorage("procurement-images", contact.profile_image);
    }
    const { error } = await supabase.schema("procurement").from("contacts").update({ profile_image: null }).eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Contact image delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/contacts/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement").from("contacts").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Contact delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
