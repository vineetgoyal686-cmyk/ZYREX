const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const supabase = require("../helpers/supabaseHelper");
const {
  normalizeStoragePath,
  uploadStorageFile,
  createSignedStorageUrl,
} = require("../helpers/storageHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const INTAKE_BUCKET = "Intake Docs";

/* ─── Upload attachment to Supabase Storage ─── */
const uploadFile = async (file, folder) => {
  if (!file) return null;
  const path = `intakes/${folder}/${Date.now()}_${file.originalname}`;
  const storagePath = await uploadStorageFile(supabase, INTAKE_BUCKET, path, file.buffer, file.mimetype);
  return { url: storagePath, storage_path: storagePath, name: file.originalname, type: file.mimetype };
};

const withSignedAttachmentUrls = async (intake) => ({
  ...intake,
  intake_items: await Promise.all((intake.intake_items || []).map(async item => ({
    ...item,
    attachments: await Promise.all((Array.isArray(item.attachments) ? item.attachments : []).map(async att => {
      const storagePath = normalizeStoragePath(att.storage_path || att.url, INTAKE_BUCKET);
      return {
        ...att,
        storage_path: storagePath,
        url: await createSignedStorageUrl(supabase, INTAKE_BUCKET, storagePath),
      };
    })),
  }))),
});

/* ════════════════════════════════════════
   SERIALIZATION
════════════════════════════════════════ */

/* GET /api/intakes/serialization — all configs */
router.get("/serialization", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("store").from("serialization").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ configs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* helper — write to audit_logs without blocking the response */
const writeAuditLog = (entityId, entityName, action, userId, userName, changes) => {
  const payload = {
    entity_type: "serialization",
    entity_id:   String(entityId),
    entity_name: entityName || null,
    action,
    user_id:   userId   || null,
    user_name: userName || null,
    changes:   changes  || null,
  };
  supabase.schema("procurement").from("audit_logs").insert(payload)
    .then(({ error }) => {
      if (error) console.error("[AuditLog] FAILED:", error.message, "|", error.details, "|", error.hint);
      else console.log("[AuditLog] OK —", action, entityName);
    });
};

/* POST /api/intakes/serialization — upsert config for a site+docType */
router.post("/serialization", async (req, res) => {
  try {
    const { doc_type = "intake", site_id, site_name, prefix, pad_length = 2, current_number,
            createdById, createdByName, updatedById, updatedByName } = req.body;
    if (!site_id || !prefix) return res.status(400).json({ error: "site_id and prefix required" });

    const { data: existing } = await supabase
      .schema("store").from("serialization").select("*").eq("doc_type", doc_type).eq("site_id", site_id).single();

    if (existing) {
      const updates = { prefix, pad_length, site_name, updated_at: new Date().toISOString() };
      if (current_number !== undefined) updates.current_number = parseInt(current_number) || 0;
      if (updatedById)   updates.updated_by_id   = updatedById;
      if (updatedByName) updates.updated_by_name = updatedByName;
      const { error } = await supabase.schema("store").from("serialization").update(updates).eq("id", existing.id);
      if (error) throw error;

      const changes = {};
      if (existing.prefix !== prefix) changes.prefix = { from: existing.prefix, to: prefix };
      if (existing.pad_length !== pad_length) changes.pad_length = { from: existing.pad_length, to: pad_length };
      if (current_number !== undefined && existing.current_number !== parseInt(current_number))
        changes.current_number = { from: existing.current_number, to: parseInt(current_number) || 0 };
      writeAuditLog(existing.id, site_name, "Updated", updatedById, updatedByName, Object.keys(changes).length ? changes : null);
    } else {
      const { data: inserted, error } = await supabase.schema("store").from("serialization")
        .insert({
          doc_type, site_id, site_name, prefix, pad_length,
          current_number: parseInt(current_number) || 0,
          created_by_id: createdById || null,
          created_by_name: createdByName || null,
        }).select().single();
      if (error) throw error;
      writeAuditLog(inserted.id, site_name, "Created", createdById, createdByName, { prefix, pad_length });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/intakes/serialization/logs/:id — fetch audit log for one config */
router.get("/serialization/logs/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("audit_logs")
      .select("*")
      .eq("entity_type", "serialization")
      .eq("entity_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/intakes/serialization/:id — remove a serialization config */
router.delete("/serialization/:id", async (req, res) => {
  try {
    const { site_name, deletedByName, deletedById } = req.body || {};
    const { error } = await supabase
      .schema("store").from("serialization").delete().eq("id", req.params.id);
    if (error) throw error;
    writeAuditLog(req.params.id, site_name, "Deleted", deletedById, deletedByName, null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/intakes/serialization/next/:docType/:siteId — preview next number (no increment) */
router.get("/serialization/next/:docType/:siteId", async (req, res) => {
  try {
    const { docType, siteId } = req.params;
    const { data } = await supabase
      .schema("store").from("serialization").select("*").eq("doc_type", docType).eq("site_id", siteId).single();
    if (!data) return res.json({ number: null, preview: null });
    const next = data.current_number + 1;
    const padded = String(next).padStart(data.pad_length, "0");
    res.json({ number: next, preview: `${data.prefix}${padded}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════
   APPROVAL FLOWS  (must be before /:id routes)
════════════════════════════════════════ */

/* GET /api/intakes/approval-flows */
router.get("/approval-flows", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("approval_flows").select("*").order("module");
    if (error) throw error;
    res.json({ flows: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* POST /api/intakes/approval-flows — upsert */
router.post("/approval-flows", async (req, res) => {
  try {
    const { module, approver_user_id, approver_name, approver_email, createdById, createdByName } = req.body;
    if (!module) return res.status(400).json({ error: "module required" });
    const { data: existing } = await supabase.from("approval_flows").select("id").eq("module", module).single();
    if (existing) {
      await supabase.from("approval_flows")
        .update({ approver_user_id, approver_name, approver_email, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("approval_flows").insert({ 
        module, approver_user_id, approver_name, approver_email,
        created_by_id: createdById || null,
        created_by_name: createdByName || null,
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ════════════════════════════════════════
   INTAKES
════════════════════════════════════════ */

/* GET /api/intakes — all intakes */
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .schema("store").from("intakes").select("*, intake_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const intakes = await Promise.all((data || []).map(withSignedAttachmentUrls));
    res.json({ intakes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/intakes/:id */
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema("store").from("intakes").select("*, intake_items(*)")
      .eq("id", req.params.id).single();
    if (error) throw error;
    res.json({ intake: await withSignedAttachmentUrls(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/intakes — create intake (draft or submit) */
/* FormData: intakeData (JSON), item_N_file_M (files) */
const intakeUpload = upload.any();

router.post("/", intakeUpload, async (req, res) => {
  try {
    const intake  = JSON.parse(req.body.intakeData || "{}");
    const items   = intake.items || [];
    const status  = intake.status || "draft"; // draft | submitted
    const files   = req.files || [];

    let intakeNumber = null;

    // If submitting, generate serial number
    if (status === "submitted" && intake.site_id) {
      const { data: serial } = await supabase
        .schema("store").from("serialization").select("*")
        .eq("doc_type", "intake").eq("site_id", intake.site_id).single();

      if (!serial) {
        return res.status(400).json({ error: "Serialization not configured for this site. Contact admin to set it up in Settings → Serialization." });
      }

      const next   = serial.current_number + 1;
      const padded = String(next).padStart(serial.pad_length, "0");
      intakeNumber = `${serial.prefix}${padded}`;
      await supabase.schema("store").from("serialization")
        .update({ current_number: next }).eq("id", serial.id);
    }

    // Insert intake header
    const { data: created, error: intakeErr } = await supabase.schema("store").from("intakes").insert({
      intake_number:  intakeNumber,
      name:           intake.name           || "",
      requisition_by: intake.requisition_by || "",
      priority:       intake.priority       || "Low",
      available_by:   intake.available_by   || null,
      site_id:        intake.site_id        || null,
      site_name:      intake.site_name      || "",
      status,
      created_by:     intake.created_by     || "",
      created_by_id:  intake.createdById    || null,
      created_by_name: intake.createdByName || null,
    }).select().single();
    if (intakeErr) throw intakeErr;

    // Insert items with attachments
    if (items.length) {
      const itemRecords = await Promise.all(items.map(async (item, idx) => {
        // Upload files for this item
        const itemFiles = files.filter(f => f.fieldname.startsWith(`item_${idx}_file_`));
        const uploaded  = await Promise.all(itemFiles.map(f => uploadFile(f, created.id)));
        return {
          intake_id:    created.id,
          product_name: item.product_name || "",
          make:         item.make         || "",
          unit:         item.unit         || "",
          existing_qty: parseFloat(item.existing_qty) || 0,
          raised_qty:   parseFloat(item.raised_qty)   || 0,
          remarks:      item.remarks      || "",
          attachments:  uploaded.filter(Boolean),
          sort_order:   idx,
        };
      }));
      const { error: itemErr } = await supabase.schema("store").from("intake_items").insert(itemRecords);
      if (itemErr) throw itemErr;
    }

    res.json({ success: true, id: created.id, intake_number: intakeNumber });
  } catch (err) {
    console.error("Intake create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PATCH /api/intakes/:id/submit — submit a draft */
router.patch("/:id/submit", async (req, res) => {
  try {
    const { data: intake, error: fetchErr } = await supabase
      .schema("store").from("intakes").select("*").eq("id", req.params.id).single();
    if (fetchErr || !intake) return res.status(404).json({ error: "Not found" });
    if (intake.status === "submitted") return res.json({ success: true, intake_number: intake.intake_number });

    let intakeNumber = intake.intake_number;
    if (!intakeNumber && intake.site_id) {
      const { data: serial } = await supabase
        .schema("store").from("serialization").select("*")
        .eq("doc_type", "intake").eq("site_id", intake.site_id).single();
      if (serial) {
        const next   = serial.current_number + 1;
        const padded = String(next).padStart(serial.pad_length, "0");
        intakeNumber = `${serial.prefix}${padded}`;
        await supabase.schema("store").from("serialization").update({ current_number: next }).eq("id", serial.id);
      }
    }

    const { error } = await supabase.schema("store").from("intakes")
      .update({ status: "submitted", intake_number: intakeNumber, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true, intake_number: intakeNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PATCH /api/intakes/:id/approve */
router.patch("/:id/approve", async (req, res) => {
  try {
    const { approved_by } = req.body;
    const { error } = await supabase.schema("store").from("intakes")
      .update({ status: "approved", approved_by: approved_by || "", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* PATCH /api/intakes/:id/reject */
router.patch("/:id/reject", async (req, res) => {
  try {
    const { reject_reason, rejected_by } = req.body;
    const { error } = await supabase.schema("store").from("intakes")
      .update({ status: "rejected", reject_reason: reject_reason || "", approved_by: rejected_by || "", updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* PATCH /api/intakes/:id/assign */
router.patch("/:id/assign", async (req, res) => {
  try {
    const { assigned_to_id, assigned_to_name, assigned_by_name } = req.body;
    const { error } = await supabase.schema("store").from("intakes")
      .update({ status: "in_review", assigned_to_id, assigned_to_name, assigned_by_name, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* PATCH /api/intakes/:id/start-working */
router.patch("/:id/start-working", async (req, res) => {
  try {
    const { error } = await supabase.schema("store").from("intakes")
      .update({ status: "working", updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* DELETE /api/intakes/:id */
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("store").from("intakes").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
