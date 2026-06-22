const crypto = require("crypto");
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const {
  normalizeStoragePath,
  uploadStorageFile,
  createSignedStorageUrl,
  removeStorageFile,
} = require("../helpers/storageHelper");
const { addClient, removeClient, broadcast } = require("../sse");

// SSE endpoint — frontend subscribes here for instant order updates
router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  addClient(res);
  req.on("close", () => removeClient(res));
});

const upload = multer({ storage: multer.memoryStorage() });

// Draft number helpers — PO-N / WO-N assigned on create, replaced with full number on issue
const isDraftNumber = (n) => /^(PO|WO)-\d+$/.test(n || '') || (n || '').startsWith('PENDING-');

const getNextDraftNumber = async (orderType) => {
  const prefix = orderType === 'Supply' ? 'PO' : 'WO';
  const { data } = await supabase.schema("procurement")
    .from("purchase_orders")
    .select("order_number")
    .like("order_number", `${prefix}-%`);
  const max = (data || []).reduce((m, o) => {
    const match = o.order_number?.match(/^(?:PO|WO)-(\d+)$/);
    return match ? Math.max(m, parseInt(match[1])) : m;
  }, 0);
  return `${prefix}-${max + 1}`;
};

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

const shortDbError = (error) => error?.message || error?.details || String(error || "Unknown database error");

const HISTORY_ID_PREFIX = "history:";
const isHistoryId = (id = "") => String(id).startsWith(HISTORY_ID_PREFIX);
const getHistoryRows = (order = {}) => Array.isArray(order.snapshot?.status_history) ? order.snapshot.status_history : [];
const hasRecallHistory = (order = {}) => {
  const snapshot = order.snapshot || {};
  const matchesRecall = (entry) => String(entry?.action || entry?._history_action || "").toLowerCase() === "recalled";
  return order.status === "Recalled" ||
    matchesRecall(order) ||
    (Array.isArray(snapshot.activity_log) && snapshot.activity_log.some(matchesRecall)) ||
    (Array.isArray(snapshot.status_history) && snapshot.status_history.some(matchesRecall));
};
const makeHistoryListOrder = (order, history) => {
  const frozen = history.order || {};
  return sanitizeRichTextDeep({
    ...order,
    ...frozen,
    id: history.history_id,
    live_order_id: order.id,
    status: history.action,
    updated_at: history.action_at || frozen.updated_at || order.updated_at,
    _history: true,
    _history_action: history.action,
    _history_at: history.action_at,
    _history_by: history.action_by,
    _history_comments: history.comments,
    companies: frozen.companies || order.companies,
    sites: frozen.sites || order.sites,
    vendors: frozen.vendors || order.vendors,
    snapshot: frozen.snapshot || order.snapshot || {},
  });
};

const loadHistoryOrder = async (historyId) => {
  const { data: orders, error } = await supabase.schema("procurement")
    .from("purchase_orders")
    .select("*, companies(*), vendors(*), contact_person:contacts(*)");
  if (error) throw error;

  for (const order of orders || []) {
    const history = getHistoryRows(order).find(h => h.history_id === historyId);
    if (history) {
      const frozenOrder = {
        ...order,
        ...(history.order || {}),
        id: history.history_id,
        live_order_id: order.id,
        status: history.action,
        updated_at: history.action_at || history.order?.updated_at || order.updated_at,
        _history: true,
        _history_action: history.action,
        _history_at: history.action_at,
        _history_by: history.action_by,
        _history_comments: history.comments,
      };
      return {
        order: sanitizeRichTextDeep(frozenOrder),
        items: sanitizeRichTextDeep(history.items || []),
      };
    }
  }
  return null;
};

const appendStatusHistorySnapshot = async ({ orderId, action, comments = "", actionBy = "" }) => {
  if (!["Reverted", "Recalled"].includes(action)) return;

  const [orderRes, itemRes] = await Promise.all([
    supabase.schema("procurement")
      .from("purchase_orders")
      .select("*, companies(*), vendors(*), contact_person:contacts(*)")
      .eq("id", orderId)
      .single(),
    supabase.schema("procurement")
      .from("purchase_order_items")
      .select("*, items(*)")
      .eq("order_id", orderId),
  ]);
  if (orderRes.error) throw orderRes.error;
  if (itemRes.error) throw itemRes.error;

  const order = orderRes.data;
  const existingSnapshot = order.snapshot || {};
  const { status_history: _oldHistory, ...frozenSnapshot } = existingSnapshot;
  const history = Array.isArray(existingSnapshot.status_history) ? existingSnapshot.status_history : [];
  const actionAt = new Date().toISOString();

  history.push({
    history_id: `history:${orderId}:${Date.now()}`,
    action,
    comments,
    action_by: actionBy,
    action_at: actionAt,
    order: { ...order, status: action, snapshot: frozenSnapshot },
    items: itemRes.data || [],
  });

  const nextSnapshot = { ...existingSnapshot, status_history: history };
  await supabase.schema("procurement")
    .from("purchase_orders")
    .update({ snapshot: nextSnapshot })
    .eq("id", orderId);
  return nextSnapshot;
};

const parseJsonArr = (v) => {
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(v || "").split(",").map(x => x.trim()).filter(Boolean);
  }
};

/* ─── Storage upload helper ─── */
const uploadToStorage = async (bucket, path, buffer, mimetype) => {
  return uploadStorageFile(supabase, bucket, path, buffer, mimetype);
};

const signOrderDocUrl = (value) => createSignedStorageUrl(supabase, "procurement-docs", value);
const signProcImageUrl = (value) => createSignedStorageUrl(supabase, "procurement-images", value);
const signVendorDocUrl = (value) => createSignedStorageUrl(supabase, "vendor-docs", value);
const signAvatarUrl = (value) => createSignedStorageUrl(supabase, "avatars", value);

const signDocArray = async (docs = []) => Promise.all((Array.isArray(docs) ? docs : []).map(async doc => {
  const storagePath = normalizeStoragePath(doc.storage_path || doc.url, "procurement-docs");
  return {
    ...doc,
    storage_path: storagePath || doc.storage_path,
    url: await signOrderDocUrl(storagePath || doc.url),
  };
}));

const signCompanyImages = async (company = {}) => {
  const [logoUrl, stampUrl, signUrl] = await Promise.all([
    signProcImageUrl(company.logo_url || company.logoUrl),
    signProcImageUrl(company.stamp_url || company.stampUrl),
    signProcImageUrl(company.sign_url || company.signUrl),
  ]);

  return {
    ...company,
    logo_url: logoUrl,
    logoUrl,
    stamp_url: stampUrl,
    stampUrl,
    sign_url: signUrl,
    signUrl,
  };
};

const signVendorDocs = async (vendor = {}) => {
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
    signVendorDocUrl(vendor.logo_url || vendor.logoUrl),
    signVendorDocUrl(vendor.doc_gst_url || vendor.docGstUrl),
    signVendorDocUrl(vendor.doc_pan_url || vendor.docPanUrl),
    signVendorDocUrl(vendor.doc_aadhaar_url || vendor.docAadhaarUrl),
    signVendorDocUrl(vendor.doc_coi_url || vendor.docCoiUrl),
    signVendorDocUrl(vendor.doc_msme_url || vendor.docMsmeUrl),
    signVendorDocUrl(vendor.doc_cancel_cheque_url || vendor.docCancelChequeUrl),
    signVendorDocUrl(vendor.doc_other_url || vendor.docOtherUrl),
    signVendorDocUrl(vendor.doc_other2_url || vendor.docOther2Url),
  ]);

  return {
    ...vendor,
    logo_url: logoUrl,
    logoUrl,
    doc_gst_url: docGstUrl,
    docGstUrl,
    doc_pan_url: docPanUrl,
    docPanUrl,
    doc_aadhaar_url: docAadhaarUrl,
    docAadhaarUrl,
    doc_coi_url: docCoiUrl,
    docCoiUrl,
    doc_msme_url: docMsmeUrl,
    docMsmeUrl,
    doc_cancel_cheque_url: docCancelChequeUrl,
    docCancelChequeUrl,
    doc_other_url: docOtherUrl,
    docOtherUrl,
    doc_other2_url: docOther2Url,
    docOther2Url,
  };
};

const signOrderStorageUrls = async (order = {}) => {
  const snapshot = { ...(order.snapshot || {}) };
  const totals = { ...(order.totals || {}) };
  let issuedBy = totals.issuedBy ? { ...totals.issuedBy } : null;

  // Enrich issuedBy with current user profile data if id is present.
  // This guarantees designation/name/signature show up even for older orders
  // where these fields were not captured at issue time.
  if (issuedBy?.id) {
    try {
      const { data: profile } = await supabase
        .from("users")
        .select("name, designation, profile_permissions")
        .eq("id", issuedBy.id)
        .maybeSingle();
      if (profile) {
        if (!issuedBy.name && profile.name) issuedBy.name = profile.name;
        if (!issuedBy.designation && profile.designation) issuedBy.designation = profile.designation;
        if (!issuedBy.signatureFile && profile.profile_permissions?.ui?.signature) {
          issuedBy.signatureFile = profile.profile_permissions.ui.signature;
        }
      }
    } catch { /* silent — fallback to whatever was stored */ }
  }

  const [
    quotationUrl,
    comparativeSheetUrl,
    preDocuments,
    postDocuments,
    companies,
    vendors,
    snapshotCompany,
    snapshotVendor,
    issuerSignatureUrl,
  ] = await Promise.all([
    signOrderDocUrl(order.quotation_url),
    signOrderDocUrl(order.comparative_sheet_url),
    signDocArray(order.pre_documents),
    signDocArray(order.post_documents),
    order.companies ? signCompanyImages(order.companies) : Promise.resolve(order.companies),
    order.vendors ? signVendorDocs(order.vendors) : Promise.resolve(order.vendors),
    snapshot.company ? signCompanyImages(snapshot.company) : Promise.resolve(snapshot.company),
    snapshot.vendor ? signVendorDocs(snapshot.vendor) : Promise.resolve(snapshot.vendor),
    issuedBy?.signatureFile ? signAvatarUrl(issuedBy.signatureFile) : Promise.resolve(null),
  ]);

  if (snapshot.company) snapshot.company = snapshotCompany;
  if (snapshot.vendor) snapshot.vendor = snapshotVendor;
  if (issuedBy) {
    if (issuerSignatureUrl) issuedBy.signatureUrl = issuerSignatureUrl;
    totals.issuedBy = issuedBy;
  }

  // Sign attachment_url in activity_log entries (amendment proofs, etc.)
  if (Array.isArray(snapshot.activity_log)) {
    snapshot.activity_log = await Promise.all(
      snapshot.activity_log.map(async entry => {
        if (!entry.attachment_url) return entry;
        return { ...entry, attachment_url: await signOrderDocUrl(entry.attachment_url) };
      })
    );
  }

  return {
    ...order,
    quotation_url: quotationUrl,
    comparative_sheet_url: comparativeSheetUrl,
    pre_documents: preDocuments,
    post_documents: postDocuments,
    companies,
    vendors,
    snapshot,
    totals,
  };
};

const normalizeOrderSnapshotStoragePaths = (mainData = {}) => {
  const snapshot = { ...(mainData.snapshot || {}) };
  if (snapshot.company) {
    snapshot.company = {
      ...snapshot.company,
      logoUrl: normalizeStoragePath(snapshot.company.logoUrl || snapshot.company.logo_url, "procurement-images"),
      logo_url: normalizeStoragePath(snapshot.company.logo_url || snapshot.company.logoUrl, "procurement-images"),
      stampUrl: normalizeStoragePath(snapshot.company.stampUrl || snapshot.company.stamp_url, "procurement-images"),
      stamp_url: normalizeStoragePath(snapshot.company.stamp_url || snapshot.company.stampUrl, "procurement-images"),
      signUrl: normalizeStoragePath(snapshot.company.signUrl || snapshot.company.sign_url, "procurement-images"),
      sign_url: normalizeStoragePath(snapshot.company.sign_url || snapshot.company.signUrl, "procurement-images"),
    };
  }
  if (snapshot.vendor) {
    snapshot.vendor = {
      ...snapshot.vendor,
      logoUrl: normalizeStoragePath(snapshot.vendor.logoUrl || snapshot.vendor.logo_url, "vendor-docs"),
      logo_url: normalizeStoragePath(snapshot.vendor.logo_url || snapshot.vendor.logoUrl, "vendor-docs"),
      docGstUrl: normalizeStoragePath(snapshot.vendor.docGstUrl || snapshot.vendor.doc_gst_url, "vendor-docs"),
      doc_gst_url: normalizeStoragePath(snapshot.vendor.doc_gst_url || snapshot.vendor.docGstUrl, "vendor-docs"),
      docPanUrl: normalizeStoragePath(snapshot.vendor.docPanUrl || snapshot.vendor.doc_pan_url, "vendor-docs"),
      doc_pan_url: normalizeStoragePath(snapshot.vendor.doc_pan_url || snapshot.vendor.docPanUrl, "vendor-docs"),
      docAadhaarUrl: normalizeStoragePath(snapshot.vendor.docAadhaarUrl || snapshot.vendor.doc_aadhaar_url, "vendor-docs"),
      doc_aadhaar_url: normalizeStoragePath(snapshot.vendor.doc_aadhaar_url || snapshot.vendor.docAadhaarUrl, "vendor-docs"),
      docCoiUrl: normalizeStoragePath(snapshot.vendor.docCoiUrl || snapshot.vendor.doc_coi_url, "vendor-docs"),
      doc_coi_url: normalizeStoragePath(snapshot.vendor.doc_coi_url || snapshot.vendor.docCoiUrl, "vendor-docs"),
      docMsmeUrl: normalizeStoragePath(snapshot.vendor.docMsmeUrl || snapshot.vendor.doc_msme_url, "vendor-docs"),
      doc_msme_url: normalizeStoragePath(snapshot.vendor.doc_msme_url || snapshot.vendor.docMsmeUrl, "vendor-docs"),
      docCancelChequeUrl: normalizeStoragePath(snapshot.vendor.docCancelChequeUrl || snapshot.vendor.doc_cancel_cheque_url, "vendor-docs"),
      doc_cancel_cheque_url: normalizeStoragePath(snapshot.vendor.doc_cancel_cheque_url || snapshot.vendor.docCancelChequeUrl, "vendor-docs"),
      docOtherUrl: normalizeStoragePath(snapshot.vendor.docOtherUrl || snapshot.vendor.doc_other_url, "vendor-docs"),
      doc_other_url: normalizeStoragePath(snapshot.vendor.doc_other_url || snapshot.vendor.docOtherUrl, "vendor-docs"),
      docOther2Url: normalizeStoragePath(snapshot.vendor.docOther2Url || snapshot.vendor.doc_other2_url, "vendor-docs"),
      doc_other2_url: normalizeStoragePath(snapshot.vendor.doc_other2_url || snapshot.vendor.docOther2Url, "vendor-docs"),
    };
  }
  return { ...mainData, snapshot };
};

/* ─── Helper: Get Current Financial Year ─── */
const getFinancialYear = (date = new Date()) => {
  const month = date.getMonth(); // 0-indexed
  const year  = date.getFullYear();
  const fyStart = month >= 3 ? year : year - 1;
  // Format: 2024-25 for FY 2024-25
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
};

/* ════════════════════════════════════
   ORDER NUMBER GENERATION
   ════════════════════════════════════ */
router.get("/next-number", async (req, res) => {
  try {
    const { siteId, companyCode, orderType } = req.query;
    if (!siteId || !companyCode || !orderType) {
      return res.status(400).json({ error: "siteId, companyCode, and orderType required" });
    }

    const orderKind = orderType === "Supply" ? "Supply" : "SITC";
    const typeCode  = orderKind === "Supply" ? "PO" : "WO";
    const fy        = getFinancialYear();

    // 1. Get Site Code
    const { data: site } = await supabase.from("projects").select("project_code").eq("id", siteId).single();
    const sCode = site?.project_code || "SITE";

    // 2. Get serialization settings for this site + FY + kind
    let { data: settings } = await supabase.schema("procurement")
      .from("serialization_settings").select("*")
      .eq("site_id", siteId).eq("financial_year", fy).eq("order_kind", orderKind).maybeSingle();

    if (!settings) {
      const { data: created } = await supabase.schema("procurement")
        .from("serialization_settings")
        .insert({ site_id: siteId, current_number: 0, financial_year: fy, order_kind: orderKind })
        .select().single();
      settings = created;
    }

    // current_number = last issued serial; next = current_number + 1
    const nextSerial = (settings.current_number || 0) + 1;
    const orderNumber = `${companyCode}/${sCode}/${typeCode}/${fy}/${nextSerial}`;

    res.json({ orderNumber, nextSerial });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   ORDER SERIALIZATION CONFIG (Admin)
   ════════════════════════════════════ */

const writeOrderAuditLog = (entityId, entityName, action, userId, userName, changes) => {
  supabase.schema("procurement").from("audit_logs").insert({
    entity_type: "order_serialization",
    entity_id:   String(entityId),
    entity_name: entityName || null,
    action,
    user_id:   userId   || null,
    user_name: userName || null,
    changes:   changes  || null,
  }).then(({ error }) => {
    if (error) console.error("[OrderAuditLog] FAILED:", error.message);
  });
};

router.get("/serialization", async (req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement")
      .from("serialization_settings").select("*");
    if (error) throw error;
    res.json({ configs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/serialization/logs/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema("procurement").from("audit_logs")
      .select("*")
      .eq("entity_type", "order_serialization")
      .eq("entity_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/serialization", async (req, res) => {
  try {
    const { site_id, current_number, financial_year, order_kind,
            site_name, createdById, createdByName, updatedById, updatedByName } = req.body;
    if (!site_id || !financial_year || !order_kind) {
      return res.status(400).json({ error: "site_id, financial_year, and order_kind required" });
    }
    const kind = order_kind === "Supply" ? "Supply" : "SITC";

    const { data: existing } = await supabase.schema("procurement")
      .from("serialization_settings").select("*")
      .eq("site_id", site_id).eq("financial_year", financial_year).eq("order_kind", kind).maybeSingle();

    if (existing) {
      await supabase.schema("procurement").from("serialization_settings")
        .update({ current_number }).eq("id", existing.id);
      const changes = {};
      if (existing.current_number !== parseInt(current_number))
        changes.current_number = { from: existing.current_number, to: parseInt(current_number) || 0 };
      writeOrderAuditLog(existing.id, site_name, "Updated", updatedById, updatedByName,
        Object.keys(changes).length ? changes : null);
    } else {
      const { data: inserted, error } = await supabase.schema("procurement").from("serialization_settings")
        .insert({ site_id, financial_year, current_number, order_kind: kind })
        .select().single();
      if (error) throw error;
      writeOrderAuditLog(inserted.id, site_name, "Created", createdById, createdByName,
        { financial_year, order_kind: kind, current_number: parseInt(current_number) || 0 });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/serialization/:id", async (req, res) => {
  try {
    const { site_name, deletedById, deletedByName } = req.body || {};
    const { error } = await supabase.schema("procurement")
      .from("serialization_settings").delete().eq("id", req.params.id);
    if (error) throw error;
    writeOrderAuditLog(req.params.id, site_name, "Deleted", deletedById, deletedByName, null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   PURCHASE ORDERS CRUD
   ════════════════════════════════════ */

// Lightweight count for Sidebar badge — avoids fetching full orders list
router.get("/pending-count", async (req, res) => {
  try {
    const { userId, isGlobalAdmin } = req.query;

    const { data: handlerRow } = await supabase
      .from("request_handlers")
      .select("users")
      .eq("module_key", "order")
      .eq("action_key", "issue")
      .maybeSingle();

    const issueUsers = handlerRow?.users || [];
    const isIssueHandler = isGlobalAdmin === "true" || issueUsers.some(u => String(u.id) === String(userId));

    if (!isIssueHandler) return res.json({ count: 0 });

    const { count, error } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["Pending Issue", "To Issue"]);

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    res.json({ count: 0 });
  }
});

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("*, companies(*), vendors(*)")
      .neq("status", "Deleted")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.warn("Supabase Error fetching orders:", shortDbError(error));
      throw error;
    };

    const pendingApprovalOrderIds = (data || [])
      .filter(o => o.status === "Pending Approval")
      .map(o => o.id)
      .filter(Boolean);
    const withdrawableRequestByOrder = {};

    if (pendingApprovalOrderIds.length > 0) {
      const { data: pendingRequests, error: pendingReqErr } = await supabase
        .from("approval_requests")
        .select("id, document_id, requested_by, status, current_level")
        .in("document_id", pendingApprovalOrderIds)
        .eq("module", "order")
        .eq("status", "pending");

      if (pendingReqErr) {
        console.warn("Approval request lookup failed:", shortDbError(pendingReqErr));
      } else {
        (pendingRequests || []).forEach(req => {
          withdrawableRequestByOrder[req.document_id] = req;
        });
      }
    }
    
    // Convert UUID made_by to user names (Optimized N+1)
    const userIds = [...new Set((data || [])
      .map(o => o.made_by)
      .filter(id => id && id.length === 36 && id.includes('-')))];

    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, name").in("id", userIds);
      userMap = (users || []).reduce((acc, u) => { acc[u.id] = u.name; return acc; }, {});
    }

    const orders = (data || []).map(order => {
      let displayName = order.made_by || "System";
      if (displayName && displayName.length === 36 && displayName.includes('-')) {
        displayName = userMap[displayName] || displayName;
      }
      return { ...order, made_by: displayName, pending_approval_request: withdrawableRequestByOrder[order.id] || null };
    });

    // For orders with missing totals (e.g. amended clones), compute from items
    const emptyTotalsIds = orders
      .filter(o => !o.totals || !Number(o.totals.subtotal))
      .map(o => o.id);

    if (emptyTotalsIds.length > 0) {
      const { data: itemRows } = await supabase.schema("procurement")
        .from("purchase_order_items")
        .select("order_id, qty, unit_rate, tax_pct, amount")
        .in("order_id", emptyTotalsIds);

      const itemsByOrder = {};
      (itemRows || []).forEach(it => {
        if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
        itemsByOrder[it.order_id].push(it);
      });

      orders.forEach(o => {
        if (emptyTotalsIds.includes(o.id) && itemsByOrder[o.id]?.length > 0) {
          const its = itemsByOrder[o.id];
          const subtotal = its.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0), 0);
          const gst = its.reduce((s, it) => {
            const base = Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0;
            return s + (base * (Number(it.tax_pct) || 0) / 100);
          }, 0);
          o.totals = { ...(o.totals || {}), subtotal, gst, grandTotal: subtotal + gst };
        }
      });
    }
    
    // Skip generating signed URLs for list view to drastically improve load times
    const sanitized = sanitizeRichTextDeep(orders);
    const historyOrders = [];
    for (const order of sanitized) {
      for (const history of getHistoryRows(order)) {
        if (["Reverted", "Recalled"].includes(history.action)) {
          historyOrders.push(makeHistoryListOrder(order, history));
        }
      }
    }
    res.json({ orders: [...sanitized, ...historyOrders] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/master/vendor-data", async (_req, res) => {
  try {
    const [ordersRes, vendorsRes] = await Promise.all([
      supabase.schema("procurement")
        .from("purchase_orders")
        .select("id, order_number, order_type, status, totals, vendor_id, site_id, snapshot, created_at, date_of_creation, companies(company_code), vendors(id, vendor_code, vendor_name, email, mobile, bank_city, bank_state, address, company_codes)")
        .in("status", ["Issued", "Amended"])
        .order("created_at", { ascending: false }),
      supabase.schema("procurement")
        .from("vendors")
        .select("id, vendor_code, vendor_name, email, mobile, bank_city, bank_state, company_codes, site_codes")
        .is("deleted_at", null)
        .order("vendor_code", { ascending: true }),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (vendorsRes.error) throw vendorsRes.error;
    const orders = ordersRes.data || [];
    const allVendors = vendorsRes.data || [];

    const { data: orderItems, error: itemErr } = await supabase.schema("procurement")
      .from("purchase_order_items")
      .select("order_id, item_id, description, qty, unit_rate, amount, items(material_name, item_code)");
    if (itemErr) throw itemErr;

    const itemsByOrder = new Map();     // order_id → [name, ...]
    const subtotalByOrder = new Map();  // order_id → computed subtotal from line items
    (orderItems || []).forEach(row => {
      const name = row.items?.material_name || row.description || "";
      if (name) {
        const list = itemsByOrder.get(row.order_id) || [];
        list.push(name);
        itemsByOrder.set(row.order_id, list);
      }
      const lineAmt = (Number(row.qty) * Number(row.unit_rate)) || Number(row.amount) || 0;
      subtotalByOrder.set(row.order_id, (subtotalByOrder.get(row.order_id) || 0) + lineAmt);
    });

    const getTaxableOrderValue = (order) => {
      const totals = order.totals || {};
      let subtotal = Number(totals.subtotal) || 0;
      const discount = Number(totals.totalDiscountAmt) || 0;
      const freight = Number(totals.frightCharges ?? totals.fright) || 0;
      // Fallback: compute subtotal from line items or snapshot when totals.subtotal is missing
      if (subtotal === 0) {
        subtotal = subtotalByOrder.get(order.id) || 0;
        if (subtotal === 0) {
          const snapItems = order.snapshot?.items || [];
          subtotal = snapItems.reduce((s, it) => s + ((Number(it.qty) * Number(it.unit_rate)) || Number(it.amount) || 0), 0);
        }
      }
      return Math.max(subtotal - discount + freight, 0);
    };

    const orderRows = orders.map(order => {
      const vendor = order.vendors || order.snapshot?.vendor || {};
      const site = order.sites || order.snapshot?.site || {};
      const uniqueItems = [...new Set((itemsByOrder.get(order.id) || []).map(x => String(x).trim()).filter(Boolean))];

      return {
        orderId: order.id,
        vendorId: vendor.id || order.vendor_id || "",
        vendorCode: vendor.vendor_code || vendor.vendorCode || "",
        vendorName: vendor.vendor_name || vendor.vendorName || "",
        companyCodes: (parseJsonArr(vendor.company_codes).length
          ? parseJsonArr(vendor.company_codes)
          : [order.companies?.company_code || order.snapshot?.company?.companyCode]
        ).map(c => String(c || "").trim()).filter(Boolean),
        state: vendor.bank_state || vendor.state || site.state || "",
        city: vendor.bank_city || vendor.city || site.city || "",
        siteCode: site.site_code || site.siteCode || site.project_code || site.projectCode || "",
        orderType: order.order_type || "",
        orderNo: order.order_number || "",
        item: uniqueItems.join(", "),
        orderValue: getTaxableOrderValue(order),
        vendorEmail: vendor.email || "",
        vendorContactNo: vendor.mobile || vendor.contactNo || vendor.contact_person_number || "",
        createdAt: order.date_of_creation || order.created_at || "",
        isPlaceholder: false,
      };
    }).filter(row => row.vendorName || row.vendorCode || row.orderNo);

    const vendorIdsWithOrders = new Set(orderRows.map(r => r.vendorId).filter(Boolean));

    const placeholderRows = allVendors
      .filter(v => !vendorIdsWithOrders.has(v.id))
      .map(v => {
        const siteCodes = parseJsonArr(v.site_codes).map(s => String(s || "").trim()).filter(Boolean);
        return {
          orderId: "",
          vendorId: v.id || "",
          vendorCode: v.vendor_code || "",
          vendorName: v.vendor_name || "",
          companyCodes: parseJsonArr(v.company_codes).map(c => String(c || "").trim()).filter(Boolean),
          state: v.bank_state || "",
          city: v.bank_city || "",
          siteCode: siteCodes.join(", "),
          orderType: "",
          orderNo: "",
          item: "",
          orderValue: null,
          vendorEmail: v.email || "",
          vendorContactNo: v.mobile || "",
          createdAt: "",
          isPlaceholder: true,
        };
      })
      .filter(row => row.vendorName || row.vendorCode);

    const rows = [...orderRows, ...placeholderRows];

    res.json({ rows: sanitizeRichTextDeep(rows) });
  } catch (err) {
    console.error("Vendor master data error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── TRASH: fetch soft-deleted orders ── */
router.get("/trash", async (req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("*, companies(*), vendors(*)")
      .eq("status", "Deleted")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const userIds = [...new Set((data || []).map(o => o.made_by).filter(id => id && id.length === 36 && id.includes('-')))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, name").in("id", userIds);
      userMap = (users || []).reduce((acc, u) => { acc[u.id] = u.name; return acc; }, {});
    }
    const orders = (data || []).map(order => {
      let displayName = order.made_by || "System";
      if (displayName && displayName.length === 36 && displayName.includes('-')) displayName = userMap[displayName] || displayName;
      return { ...order, made_by: displayName };
    });
    res.json({ orders: sanitizeRichTextDeep(orders) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── RESTORE: move order back from Trash ── */
router.post("/:id/restore", async (req, res) => {
  try {
    const { data: order, error: fetchErr } = await supabase.schema("procurement")
      .from("purchase_orders").select("status, snapshot").eq("id", req.params.id).single();
    if (fetchErr) throw fetchErr;
    if (order.status !== "Deleted") {
      return res.status(400).json({ error: "Only trashed orders can be restored." });
    }

    const originalStatus = order.snapshot?._deleted?.original_status || "Draft";
    const restoredBy = req.query.restored_by || req.body?.restored_by || "Unknown";
    const restoredAt = new Date().toISOString();
    const newSnapshot = { ...(order.snapshot || {}) };
    delete newSnapshot._deleted;
    const actLog = Array.isArray(newSnapshot.activity_log) ? [...newSnapshot.activity_log] : [];
    actLog.push({
      action: "Restored",
      action_by: restoredBy,
      action_at: restoredAt,
      comments: `Restored to ${originalStatus}`,
    });
    newSnapshot.activity_log = actLog;

    const { error } = await supabase.schema("procurement").from("purchase_orders")
      .update({ status: originalStatus, snapshot: newSnapshot, updated_at: restoredAt }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true, restored_status: originalStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PERMANENT DELETE: hard-delete a trashed order ── */
router.delete("/:id/permanent", async (req, res) => {
  try {
    const { data: order, error: orderErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("status, quotation_url, comparative_sheet_url, pre_documents, post_documents")
      .eq("id", req.params.id).single();
    if (orderErr) throw orderErr;
    if (order.status !== "Deleted") {
      return res.status(400).json({ error: "Only trashed orders can be permanently deleted." });
    }
    try {
      const filesToDelete = [
        order.quotation_url, order.comparative_sheet_url,
        ...((Array.isArray(order.pre_documents)  ? order.pre_documents  : []).map(d => d?.url).filter(Boolean)),
        ...((Array.isArray(order.post_documents) ? order.post_documents : []).map(d => d?.url).filter(Boolean)),
      ].filter(Boolean);
      await Promise.allSettled(filesToDelete.map(url => removeStorageFile(supabase, "procurement-docs", url)));
    } catch { /* silent */ }
    await supabase.schema("procurement").from("purchase_order_items").delete().eq("order_id", req.params.id);
    const { error } = await supabase.schema("procurement").from("purchase_orders").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", upload.fields([
  { name: "quotation", maxCount: 1 },
  { name: "comparative", maxCount: 1 }
]), async (req, res) => {
  try {
    const bodyData = JSON.parse(req.body.data || "{}");
    const files    = req.files || {};
    let { mainData, items, nextSerial } = bodyData;
    mainData = normalizeOrderSnapshotStoragePaths(sanitizeRichTextDeep(mainData || {}));
    items = sanitizeRichTextDeep(items || []);

    // 1. Handle File Uploads
    let quotationUrl = "";
    let comparativeUrl = "";

    if (files.quotation) {
      quotationUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/quotations/quotation_${Date.now()}_${files.quotation[0].originalname}`,
        files.quotation[0].buffer, files.quotation[0].mimetype
      );
    }
    if (files.comparative) {
      comparativeUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/comparative/comparative_${Date.now()}_${files.comparative[0].originalname}`,
        files.comparative[0].buffer, files.comparative[0].mimetype
      );
    }

    // 1.1 Assign draft number (PO-N / WO-N) on create; final number assigned on Issue.
    if (mainData.status !== 'Issued') {
      mainData.order_number = await getNextDraftNumber(mainData.order_type || 'Supply');
    }

    // These are not purchase_orders DB columns. They are only used by
    // status/timeline flows and must not be sent to Supabase on create.
    delete mainData.action_by;
    delete mainData.comments;
    delete mainData.reason;
    delete mainData.issuedBy;

    // 2. Insert main order
    const { data: order, error: orderErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .insert({
        ...mainData,
        quotation_url: quotationUrl,
        comparative_sheet_url: comparativeUrl
      })
      .select().single();

    if (orderErr) throw orderErr;

    // 3. Insert items
    if (items && items.length > 0) {
      const itemInserts = items.map(it => ({ ...it, order_id: order.id }));
      const { error: itemErr } = await supabase.schema("procurement").from("purchase_order_items").insert(itemInserts);
      if (itemErr) throw itemErr;
    }

    // 4. Update serialization ONLY if Issued (usually not from here anymore)
    if (mainData.status === 'Issued') {
      const kindForSerial = mainData.order_type === "Supply" ? "Supply" : "SITC";
      await supabase.schema("procurement").from("serialization_settings")
        .update({ current_number: nextSerial })
        .eq("site_id", mainData.site_id)
        .eq("order_kind", kindForSerial);
    }

    res.json({ success: true, id: order.id });
  } catch (err) {
    console.error("Order save error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (isHistoryId(req.params.id)) {
      const historical = await loadHistoryOrder(req.params.id);
      if (!historical) return res.status(404).json({ error: "History snapshot not found" });
      historical.order = await signOrderStorageUrls(historical.order);
      return res.json(historical);
    }

    const { data: order, error: orderErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("*, companies(*), vendors(*), contact_person:contacts(*)")
      .eq("id", req.params.id)
      .single();
    if (orderErr) throw orderErr;

    const { data: items, error: itemErr } = await supabase.schema("procurement")
      .from("purchase_order_items")
      .select("*, items(*)")
      .eq("order_id", req.params.id);
    if (itemErr) throw itemErr;

    const signedOrder = await signOrderStorageUrls(order);

    // Resolve made_by UUID → user name (same as list route)
    if (signedOrder.made_by && signedOrder.made_by.length === 36 && signedOrder.made_by.includes('-')) {
      const { data: u } = await supabase.from("users").select("name").eq("id", signedOrder.made_by).single();
      if (u?.name) signedOrder.made_by = u.name;
    }

    res.json({ order: sanitizeRichTextDeep(signedOrder), items: sanitizeRichTextDeep(items || []) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   BULK IMPORT — rich schema, grouped by order number
   ════════════════════════════════════ */
router.post("/bulk-import", async (req, res) => {
  try {
    const { rows, orderKind, createdBy } = req.body; // orderKind: "Purchase Order" | "Work Order"
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }

    // Preload masters
    const [{ data: companies }, { data: sites }, { data: vendors }, { data: clauses }, { data: clauseVersions }, { data: contacts }, { data: users }] = await Promise.all([
      supabase.schema("procurement").from("companies").select("*"),
      supabase.from("projects").select("*"),
      supabase.schema("procurement").from("vendors").select("*"),
      supabase.schema("procurement").from("clauses").select("*"),
      supabase.schema("procurement").from("clause_versions").select("*"),
      supabase.schema("procurement").from("contacts").select("*"),
      supabase.from("users").select("id, name, email, designation, profile_permissions"),
    ]);
    const companyByCode = new Map((companies || []).map(c => [String(c.company_code || "").toUpperCase().trim(), c]));
    const siteByCode    = new Map((sites || []).map(s => [String(s.project_code || "").toUpperCase().trim(), s]));
    const vendorByCode  = new Map((vendors || []).map(v => [String(v.vendor_code || "").toUpperCase().trim(), v]));
    const vendorByPan   = new Map((vendors || []).filter(v => v.pan).map(v => [String(v.pan).toUpperCase().trim(), v]));
    const clauseByCode  = new Map((clauses  || []).map(c => [String(c.code || "").toUpperCase().trim(), c]));
    const contactByCode = new Map((contacts || []).map(c => [String(c.contact_code || "").toUpperCase().trim(), c]));
    const userByEmail   = new Map((users || []).map(u => [String(u.email || "").toLowerCase().trim(), u]));
    // versionMap: clause_id -> { version: pointsArray }
    const versionMap = new Map();
    (clauseVersions || []).forEach(v => {
      if (!versionMap.has(v.clause_id)) versionMap.set(v.clause_id, {});
      versionMap.get(v.clause_id)[v.version] = Array.isArray(v.points) ? v.points : [];
    });

    /* Resolve contact IDs cell from Excel — accepts "CON-001" or "CON-001; CON-002"
       Returns array of { personName, contactNumber, designation, company } */
    const resolveContactsCell = (cell) => {
      if (!cell) return [];
      const tokens = String(cell).split(/\r?\n|;|,/).map(s => s.trim()).filter(Boolean);
      const out = [];
      for (const tok of tokens) {
        const code = tok.toUpperCase();
        const c = contactByCode.get(code);
        if (c) {
          out.push({
            personName:    c.person_name    || "",
            contactNumber: c.contact_number || "",
            designation:   c.designation    || "",
            company:       c.company        || "",
          });
        }
      }
      return out;
    };

    /* Resolve clause cell from Excel — accepts:
       "TC-001"          → version 1 points
       "TC-001/V2"       → version 2 points
       "TC-001; TC-002"  → multiple, joined
       Falls back to literal text if code not found. */
    const resolveClauseSelection = (cell, expectedType) => {
      if (!cell) return { points: [], refs: [] };
      const tokens = String(cell).split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
      const pointsOut = [];
      const refs = [];
      for (const tok of tokens) {
        const m = tok.match(/^([A-Z]+-\d+)(?:\/V(\d+))?$/i);
        if (m) {
          const code = m[1].toUpperCase();
          const ver  = m[2] ? parseInt(m[2]) : 1;
          const cl   = clauseByCode.get(code);
          if (cl) {
            const versions = versionMap.get(cl.id) || {};
            const points = versions[ver] || (ver === 1 ? (Array.isArray(cl.points) ? cl.points : []) : []);
            if (points && points.length) {
              pointsOut.push(...points);
              refs.push({
                type: cl.type || expectedType,
                code: ver > 1 ? `${code}/V${ver}` : code,
                category: cl.category || "",
                title: cl.title || "",
                points,
              });
              continue;
            }
          }
        }
        pointsOut.push(tok);
        refs.push({
          type: expectedType,
          code: "Custom",
          category: "",
          title: tok.slice(0, 80),
          points: [tok],
        });
      }
      return { points: pointsOut, refs };
    };

    const fy = getFinancialYear();
    const pick = (obj, keys) => { for (const k of keys) { const v = obj[k]; if (v !== undefined && v !== null && String(v).trim() !== "") return v; } return ""; };
    const parseDate = (v) => {
      if (!v) return null;
      if (typeof v === 'number') {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d) ? null : d.toISOString();
      }
      const d = new Date(v);
      return isNaN(d) ? null : d.toISOString();
    };
    const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

    // Group rows by order key — blank WO No. inherits the last seen key (fill-down)
    const groups = new Map();
    let lastKey = null;
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      const rawKey = String(pick(r, ["Purchase Order No.", "Work Order No.", "Order No", "Order Number"]) || "").trim();
      const key = rawKey || lastKey || `__row_${i}`;
      if (rawKey) lastKey = rawKey;
      if (!groups.has(key)) groups.set(key, { key, headRowNo: rowNo, items: [] });
      groups.get(key).items.push({ r, rowNo });
    });

    const results = { inserted: 0, failed: [], orders: [] };

    for (const group of groups.values()) {
      // Merge all rows: pick first non-empty value per column — user can fill order-level
      // fields in any row (or all rows), not just the first one.
      const h = {};
      for (const { r } of group.items) {
        for (const [k, v] of Object.entries(r)) {
          if (!(k in h) && v !== undefined && v !== null && String(v).trim() !== "") h[k] = v;
        }
      }
      const headRowNo = group.headRowNo;
      try {
        const compCode = String(pick(h, ["Company Code"])).toUpperCase().trim();
        const siteCode = String(pick(h, ["Site Code"])).toUpperCase().trim();
        const vendCode = String(pick(h, ["Vendor Code"])).toUpperCase().trim();
        const vendPan  = String(pick(h, ["Vendor PAN"])).toUpperCase().trim();

        const company = companyByCode.get(compCode);
        const site = siteByCode.get(siteCode);
        const vendorMaster = (vendCode && vendorByCode.get(vendCode))
                          || (vendPan  && vendorByPan.get(vendPan));

        if (!site) throw new Error(`Site code "${siteCode}" not found in master`);
        if (!company) throw new Error(`Company code "${compCode}" not found in master`);
        if (!vendorMaster) throw new Error(`Vendor not found — provide a valid Vendor Code (${vendCode || "blank"}) or Vendor PAN (${vendPan || "blank"})`);

        // Determine order type
        const excelOrderType = String(pick(h, ["Order Type"])).trim();
        let orderType = excelOrderType;
        if (!orderType) orderType = orderKind === "Work Order" ? "SITC" : "Supply";

        // Status — default Issued, but respect Excel value
        const validStatuses = ["Draft", "Review", "Pending Issue", "Issued", "Rejected", "Reverted", "Recalled", "Cancelled"];
        const excelStatus = String(pick(h, ["Status"])).trim();
        const status = validStatuses.find(s => s.toLowerCase() === excelStatus.toLowerCase()) || "Issued";

        // Order number — use Excel value if provided, else assign serial (for Issued only)
        let orderNumber = String(group.key || "").trim();
        let incrementSerial = false;
        let serialObj = null;
        if (!orderNumber || orderNumber.startsWith("__row_")) {
          if (status === "Issued") {
            const kindForSerial = orderType === "Supply" ? "Supply" : "SITC";
            const { data: s } = await supabase.schema("procurement")
              .from("serialization_settings").select("*")
              .eq("site_id", site.id).eq("financial_year", fy).eq("order_kind", kindForSerial).maybeSingle();
            serialObj = s;
            if (!serialObj) {
              const { data: created } = await supabase.schema("procurement")
                .from("serialization_settings")
                .insert({ site_id: site.id, financial_year: fy, current_number: 0, order_kind: kindForSerial })
                .select().single();
              serialObj = created;
            }
            const typeCode = orderType === "Supply" ? "PO" : "WO";
            const nextSerial = (serialObj.current_number || 0) + 1;
            serialObj._nextSerial = nextSerial; // remember for increment step
            orderNumber = `${company.company_code}/${site.site_code}/${typeCode}/${fy}/${nextSerial}`;
            incrementSerial = true;
          } else {
            orderNumber = await getNextDraftNumber(order.order_type || 'Supply');
          }
        }

        // Build vendor snapshot — pull entirely from master (Excel only carries Vendor ID)
        const vendorSnap = {
          vendorName:     vendorMaster.vendor_name     || "",
          gstin:          vendorMaster.gstin           || "",
          pan:            vendorMaster.pan             || "",
          aadhar:         vendorMaster.aadhar_no       || "",
          msme:           vendorMaster.msme_number     || "",
          contactPerson:  vendorMaster.contact_person  || "",
          mobile:         vendorMaster.mobile          || "",
          email:          vendorMaster.email           || "",
          address:        vendorMaster.address         || "",
          bankName:       vendorMaster.bank_name       || "",
          ifscCode:       vendorMaster.ifsc_code       || "",
          accountNumber:  vendorMaster.account_number  || "",
          beneficiaryName: vendorMaster.account_holder || vendorMaster.vendor_name || "",
        };

        // Build company snapshot — pull entirely from master (Excel only carries Company Code)
        const companySnap = {
          companyCode:  company.company_code,
          companyName:  company.company_name || "",
          gstin:        company.gstin        || "",
          pan:          company.pan          || "",
          phone:        company.phone        || "",
          address:      company.address      || "",
          logo_url:     company.logo_url     || "",
          stamp_url:    company.stamp_url    || "",
          sign_url:     company.sign_url     || "",
          personName:   company.person_name  || "",
          designation:  company.designation  || "",
        };

        // Build site snapshot
        const siteSnap = {
          siteCode: site.project_code || site.site_code || "",
          siteName: site.project_name || site.site_name || "",
          city: site.city || "",
          state: site.state || "",
          siteAddress: site.site_address || site.address || "",
          billingAddress: site.billing_address || "",
        };

        // Resolve state-matched billing profile (same logic as frontend save)
        const siteState = site.state || "";
        const stateBlocks = company.state_billing_profiles || [];
        const stateBlock = siteState ? stateBlocks.find(b => b.stateName?.toLowerCase() === siteState.toLowerCase()) : null;
        const stateProfile = stateBlock ? (stateBlock.profiles?.find(p => p.isDefault) || stateBlock.profiles?.[0] || null) : null;
        const billingProfile = stateProfile
          ? { ...stateProfile, source: "state" }
          : (company.billing_gstin || company.address)
            ? { address: company.address || "", gstin: company.billing_gstin || company.gstin || "", source: "entity" }
            : null;

        // Parse description: multi-line cell (Alt+Enter) or ||| separator → array of points
        const descToPoints = (v) => {
          if (!v) return [];
          let s = String(v).trim();
          if (!s) return [];
          if (s.startsWith('[')) {
            try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : [s]; } catch { return [s]; }
          }
          return s.split(/\r?\n|\|\|\|/).map(x => x.trim()).filter(Boolean);
        };
        const pointsToStorage = (points) => {
          if (!points || points.length === 0) return "";
          if (points.length === 1) return points[0];
          return JSON.stringify(points);
        };
        const parseDescription = (v) => pointsToStorage(descToPoints(v));

        // Build raw items (one per Excel row)
        const rawItems = group.items.map(({ r }) => ({
          material_name: String(pick(r, ["Item Name"])).trim(),
          _descPoints:   descToPoints(pick(r, ["Description", "Specification"])),
          model_number:  String(pick(r, ["Model No", "Model Number"])).trim(),
          make:          String(pick(r, ["Brand Name", "Brand"])).trim(),
          unit:          String(pick(r, ["Unit"])).trim() || "nos",
          qty:           num(pick(r, ["Quantity", "Qty"])),
          unit_rate:     num(pick(r, ["Unit Price (₹)", "Unit Price", "Rate"])),
          tax_pct:       num(pick(r, ["Tax (%)", "Tax%", "Tax Pct"])),
          discount_pct:  num(pick(r, ["Discount (%)", "Discount%", "Discount Pct"])),
          amount:        num(pick(r, ["Amount"])) || (num(pick(r, ["Quantity", "Qty"])) * num(pick(r, ["Unit Price (₹)", "Unit Price", "Rate"]))),
          remarks:       String(pick(r, ["Remarks"])).trim(),
        })).filter(it => it.material_name || it.qty > 0);

        // Consolidate: consecutive rows with same (Item Name + Unit) AND blank qty → merge as additional description points
        const consolidated = [];
        for (const raw of rawItems) {
          const last = consolidated[consolidated.length - 1];
          const isContinuation = last
            && last.material_name.toLowerCase() === raw.material_name.toLowerCase()
            && last.unit.toLowerCase() === raw.unit.toLowerCase()
            && raw.material_name
            && (!raw.qty || raw.qty === 0);

          if (isContinuation) {
            last._descPoints = [...last._descPoints, ...raw._descPoints];
            if (!last.model_number && raw.model_number) last.model_number = raw.model_number;
            if (!last.make && raw.make) last.make = raw.make;
            if (!last.remarks && raw.remarks) last.remarks = raw.remarks;
          } else {
            consolidated.push(raw);
          }
        }

        // Final items — strip temp fields, flatten points to storage format
        // material_name stored directly (bulk import has no item_id FK).
        // description gets the spec points; if none, falls back to item name
        // so display code (row.items?.material_name || row.description) still works.
        const itemRows = consolidated.map(it => ({
          material_name: it.material_name || "",
          description:   pointsToStorage(it._descPoints) || "",
          model_number:  it.model_number,
          make:          it.make,
          unit:          it.unit,
          qty:           it.qty,
          unit_rate:     it.unit_rate,
          tax_pct:       it.tax_pct,
          discount_pct:  it.discount_pct,
          amount:        it.amount,
          remarks:       it.remarks,
        }));

        // Totals
        const subtotal   = itemRows.reduce((s, it) => s + (it.qty * it.unit_rate), 0);
        const discAmt    = itemRows.reduce((s, it) => s + (it.qty * it.unit_rate * (it.discount_pct || 0) / 100), 0);
        const itemGst    = itemRows.reduce((s, it) => {
          const net = (it.qty * it.unit_rate) * (1 - (it.discount_pct || 0) / 100);
          return s + (net * (it.tax_pct || 0) / 100);
        }, 0);
        const fright     = num(pick(h, ["Fright", "Freight"]));
        const totalTax   = num(pick(h, ["Total Tax", "Total Tax (₹)"])) || itemGst;
        const grandTotal = num(pick(h, ["Total Amount", "Total Amount (₹)", "Grand Total"])) || (subtotal - discAmt + fright + totalTax);

        const issuedAt = parseDate(pick(h, ["Issued At", "Issued Date"])) || (status === "Issued" ? new Date().toISOString() : null);

        // Resolve issuer by email
        const issuerEmail = String(pick(h, ["Issued By (Email)", "Issued By Email", "Issuer Email"]) || "").toLowerCase().trim();
        const requiresIssuer = ["Issued", "Amended"].includes(status);
        if (requiresIssuer && !issuerEmail) throw new Error(`"Issued By (Email)" is required when Status is "${status}"`);
        const issuerUser = issuerEmail ? userByEmail.get(issuerEmail) : null;
        if (requiresIssuer && issuerEmail && !issuerUser) throw new Error(`Issued By email "${issuerEmail}" not found in system`);
        const issuedBy = issuerUser ? {
          id:            issuerUser.id,
          name:          issuerUser.name || "",
          designation:   issuerUser.designation || "",
          signatureFile: issuerUser.profile_permissions?.ui?.signature || null,
        } : null;

        const totals = {
          subtotal,
          totalDiscountAmt: discAmt,
          discount_mode: "line",
          gst: totalTax,
          frightCharges: fright,
          grandTotal,
          showModel: itemRows.some(it => it.model_number),
          showBrand: itemRows.some(it => it.make),
          showRemarks: itemRows.some(it => it.remarks),
          issuedAt,
          ...(issuedBy && { issuedBy }),
          bulkImported: true,
        };

        const arrify = (v) => {
          if (!v) return [];
          const s = String(v).trim();
          if (!s) return [];
          // split on newlines or semicolons
          return s.split(/\r?\n|;/).map(x => x.trim()).filter(Boolean);
        };

        const tcSelection = resolveClauseSelection(pick(h, ["TC ID", "Terms & Conditions ID", "Term Condition", "Terms & Conditions"]), "TC");
        const paySelection = resolveClauseSelection(pick(h, ["Payment Terms ID", "Payment Terms"]), "PAY");
        const govSelection = resolveClauseSelection(pick(h, ["Govern Laws ID", "Governing Laws ID", "Governlaws", "Governing Laws"]), "GOV");
        const anxSelection = resolveClauseSelection(pick(h, ["Annexure ID", "Annexures ID", "Annexure", "Annexures"]), "ANX");

        const insertRow = {
          order_number: orderNumber,
          order_type: orderType,
          status,
          subject:       String(pick(h, ["Subject"])).trim(),
          ref_number:    String(pick(h, ["Reference Number", "Ref No"])).trim() || null,
          company_id:    company.id,
          site_id:       site.id,
          vendor_id:     vendorMaster?.id || null,
          made_by:       String(pick(h, ["Created By"]) || createdBy || "Bulk Import").trim(),
          request_by:    String(pick(h, ["Requisition By"])).trim() || null,
          date_of_creation: parseDate(pick(h, ["Created On", "Created Date", "Order Date"])) || new Date().toISOString(),
          notes:         (() => {
            const notesText = String(pick(h, ["Order Notes"]) || "").trim();
            if (!notesText) return null;
            const pts = notesText.split(/[,\r\n]+/).map(x => x.trim()).filter(Boolean);
            if (pts.length > 1) return `<ol>${pts.map(p => `<li>${p}</li>`).join("")}</ol>`;
            return notesText;
          })(),
          terms_conditions: tcSelection.points,
          payment_terms:    paySelection.points,
          governing_laws:   govSelection.points,
          annexures:        anxSelection.points,
          totals,
          // FREEZE snapshot at import time so later master edits don't affect this order
          snapshot: {
            company: companySnap,
            site: siteSnap,
            vendor: vendorSnap,
            contacts: resolveContactsCell(pick(h, ["Contact IDs", "Contact ID", "Contacts"])),
            billingProfile,
            billingState: siteState || null,
            clauses: [
              ...tcSelection.refs,
              ...paySelection.refs,
              ...govSelection.refs,
              ...anxSelection.refs,
            ],
          },
        };

        const { data: inserted, error: insErr } = await supabase.schema("procurement")
          .from("purchase_orders").insert(insertRow).select().single();
        if (insErr) throw insErr;

        if (itemRows.length > 0) {
          const itemInserts = itemRows.map(it => ({ ...it, order_id: inserted.id }));
          const { error: itmErr } = await supabase.schema("procurement")
            .from("purchase_order_items").insert(itemInserts);
          if (itmErr) throw itmErr;
        }

        if (incrementSerial && serialObj) {
          // Set current_number to the serial we just issued (last-issued semantics)
          await supabase.schema("procurement")
            .from("serialization_settings")
            .update({ current_number: serialObj._nextSerial })
            .eq("id", serialObj.id);
        }

        const amendedFromNo = String(pick(h, ["Amended From (Order No)", "Amended From", "Amendment Of"]) || "").trim();
        results.inserted++;
        results.orders.push({ id: inserted.id, order_number: orderNumber, status, amendedFromNo });
      } catch (grpErr) {
        results.failed.push({ row: headRowNo, orderKey: group.key, reason: grpErr.message });
      }
    }

    // Second pass: link amended_from_id for orders that reference a parent
    const toLink = results.orders.filter(o => o.amendedFromNo);
    if (toLink.length > 0) {
      const insertedByNo = new Map(results.orders.map(o => [o.order_number, o.id]));
      for (const o of toLink) {
        try {
          // Look in current batch first, then DB
          let parentId = insertedByNo.get(o.amendedFromNo);
          if (!parentId) {
            const { data: parent } = await supabase.schema("procurement")
              .from("purchase_orders").select("id").eq("order_number", o.amendedFromNo).single();
            parentId = parent?.id || null;
          }
          if (parentId) {
            await supabase.schema("procurement")
              .from("purchase_orders").update({ amended_from_id: parentId }).eq("id", o.id);
          }
        } catch { /* non-fatal — order already inserted */ }
      }
    }

    res.json({ success: true, ordersInExcel: groups.size, ...results });
  } catch (err) {
    console.error("Bulk import error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", upload.fields([
  { name: "quotation", maxCount: 1 },
  { name: "comparative", maxCount: 1 }
]), async (req, res) => {
  try {
    const bodyData = JSON.parse(req.body.data || "{}");
    const files    = req.files || {};
    let { mainData } = bodyData;
    mainData = normalizeOrderSnapshotStoragePaths(sanitizeRichTextDeep(mainData || {}));
    // Distinguish "items omitted from payload" vs "items: []".
    // If caller didn't send items at all (status-only updates etc.), DO NOT
    // touch the items table. Only replace items when caller explicitly sends an array.
    const itemsProvided = Array.isArray(bodyData.items);
    const items = itemsProvided ? sanitizeRichTextDeep(bodyData.items) : null;

    // Fetch existing urls/status before any mutation so locked orders remain read-only.
    const { data: existing } = await supabase.schema("procurement")
      .from("purchase_orders").select("quotation_url, comparative_sheet_url, status, snapshot, subject, ref_number, delivery_date, priority, totals, site_id, company_id, date_of_creation")
      .eq("id", req.params.id).single();

    const wasRecalled = hasRecallHistory(existing);
    if (wasRecalled) {
      mainData = {
        ...mainData,
        site_id: existing.site_id,
        company_id: existing.company_id,
        date_of_creation: existing.date_of_creation ?? mainData.date_of_creation,
        snapshot: {
          ...(mainData.snapshot || {}),
          site: existing.snapshot?.site || mainData.snapshot?.site,
          company: existing.snapshot?.company || mainData.snapshot?.company,
          billingProfile: existing.snapshot?.billingProfile || mainData.snapshot?.billingProfile,
          billingState: existing.snapshot?.billingState || mainData.snapshot?.billingState,
        },
      };
    }

    // Capture incoming values for edit tracking before status handlers may mutate mainData.snapshot
    const _editBy       = mainData.action_by || mainData.made_by || "";
    const _newSubject   = mainData.subject || "";
    const _newRef       = mainData.ref_number || "";
    const _newDelivery  = (mainData.delivery_date || "").split("T")[0];
    const _newPriority  = mainData.priority || "";
    const _newVendor    = mainData.snapshot?.vendor?.vendorName || "";
    const _newSite      = mainData.snapshot?.site?.siteCode || "";
    const _newTotal     = Math.round(Number(mainData.totals?.grandTotal) || 0);

    const lockedStatuses = ["Rejected", "Cancelled", "Reverted", "Recalled"];
    if (lockedStatuses.includes(existing?.status)) {
      return res.status(400).json({ error: `${existing.status} orders cannot be edited` });
    }

    if (["Reverted", "Recalled"].includes(mainData.status)) {
      const nextSnapshot = await appendStatusHistorySnapshot({
        orderId: req.params.id,
        action: mainData.status,
        comments: mainData.comments || mainData.reason || "",
        actionBy: mainData.action_by || "",
      });
      // Also log to activity_log for the Log tab timeline
      const actLog = Array.isArray(nextSnapshot?.activity_log) ? [...nextSnapshot.activity_log] : [];
      actLog.push({ action: mainData.status, action_by: mainData.action_by || "", action_at: new Date().toISOString(), comments: mainData.comments || mainData.reason || "" });
      mainData.status = "Draft";
      mainData.snapshot = { ...nextSnapshot, activity_log: actLog };
    } else if (mainData.status && mainData.status !== existing?.status) {
      // Lightweight activity log for Review, Pending Issue, Issued, Draft, etc.
      const { data: curOrder } = await supabase.schema("procurement")
        .from("purchase_orders").select("snapshot").eq("id", req.params.id).single();
      const curSnap = curOrder?.snapshot || {};
      const actLog = Array.isArray(curSnap.activity_log) ? [...curSnap.activity_log] : [];
      actLog.push({ action: mainData.status, action_by: mainData.action_by || "", action_at: new Date().toISOString(), ...(mainData.comments ? { comments: mainData.comments } : {}) });
      mainData.snapshot = { ...curSnap, ...(mainData.snapshot || {}), activity_log: actLog };
    }

    // Edit field tracking — only on full form saves (items array provided) for existing orders
    if (itemsProvided && existing && req.params.id) {
      const oldSubject  = existing.subject || "";
      const oldRef      = existing.ref_number || "";
      const oldDelivery = (existing.delivery_date || "").split("T")[0];
      const oldPriority = existing.priority || "";
      const oldVendor   = existing.snapshot?.vendor?.vendorName || "";
      const oldSite     = existing.snapshot?.site?.siteCode || "";
      const oldTotal    = Math.round(Number(existing.totals?.grandTotal) || 0);

      const changes = [];
      const chk = (field, from, to) => { if ((from || "") !== (to || "")) changes.push({ field, from: from || "—", to: to || "—" }); };
      chk("Subject",        oldSubject,  _newSubject);
      chk("Reference No.",  oldRef,      _newRef);
      chk("Delivery Date",  oldDelivery, _newDelivery);
      chk("Priority",       oldPriority, _newPriority);
      chk("Vendor",         oldVendor,   _newVendor);
      chk("Site",           oldSite,     _newSite);
      if (oldTotal !== _newTotal) changes.push({ field: "Total Value", from: `Rs ${oldTotal.toLocaleString("en-IN")}`, to: `Rs ${_newTotal.toLocaleString("en-IN")}` });

      if (changes.length > 0) {
        const curSnap = mainData.snapshot || existing.snapshot || {};
        const actLog  = Array.isArray(curSnap.activity_log) ? [...curSnap.activity_log] : [];
        actLog.push({ action: "Edited", action_by: _editBy, action_at: new Date().toISOString(), changes });
        mainData.snapshot = { ...curSnap, activity_log: actLog };
      }
    }

    // These are not DB columns — used only for activity_log above
    delete mainData.action_by;
    delete mainData.comments;

    let quotationUrl    = existing?.quotation_url    || "";
    let comparativeUrl  = existing?.comparative_sheet_url || "";

    if (files.quotation) {
      quotationUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/quotations/quotation_${Date.now()}_${files.quotation[0].originalname}`,
        files.quotation[0].buffer, files.quotation[0].mimetype
      );
    }
    if (files.comparative) {
      comparativeUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/comparative/comparative_${Date.now()}_${files.comparative[0].originalname}`,
        files.comparative[0].buffer, files.comparative[0].mimetype
      );
    }

    // 2.1 Override order_number to DRAFT if not Issued (prevent premature numbering on Edit)
    // Exception: amendment clones (e.g. PO-4A, PO-4B) keep their assigned number — they
    // are NOT new pending orders, they're versions of an issued one.
    if (mainData.status !== 'Issued' && !isDraftNumber(mainData.order_number)) {
        const { data: curr } = await supabase.schema("procurement")
          .from("purchase_orders").select("order_number, amended_from_id, order_type").eq("id", req.params.id).single();

        if (curr?.amended_from_id) {
          // Amendment clone — keep its existing number (e.g. .../4A)
          mainData.order_number = curr.order_number;
        } else if (isDraftNumber(curr?.order_number)) {
          mainData.order_number = curr.order_number; // Preserve existing PO-N / WO-N
        } else {
          // Shouldn't happen for orders created after this update, but handle gracefully
          mainData.order_number = curr?.order_number || await getNextDraftNumber(curr?.order_type || 'Supply');
        }
    }

    // 2.2 Assign final order number when status → Issued and current number is PENDING-
    if (mainData.status === 'Issued') {
      const passedIssuedBy = mainData.issuedBy || null;
      delete mainData.issuedBy;
      mainData.totals = {
        ...(mainData.totals || {}),
        issuedAt: new Date().toISOString(),
        ...(passedIssuedBy ? { issuedBy: passedIssuedBy } : {}),
      };

      const { data: curr } = await supabase.schema("procurement")
        .from("purchase_orders")
        .select("order_number, order_type, site_id, companies(company_code)")
        .eq("id", req.params.id)
        .single();
      const { data: currProject } = curr?.site_id
        ? await supabase.from("projects").select("project_code").eq("id", curr.site_id).single()
        : { data: null };

      // Only generate a new number if the current one is a draft ID (PO-N / WO-N / PENDING-).
      // If it's already a final number (like .../1A from an amendment), keep it.
      const isPending = isDraftNumber(curr?.order_number) || isDraftNumber(mainData.order_number);
      const needsNumber = curr && isPending;

      if (needsNumber && curr.site_id) {
        try {
          const fy = getFinancialYear();
          const kindForSerial = curr.order_type === "Supply" ? "Supply" : "SITC";
          let { data: serialObj } = await supabase.schema("procurement")
            .from("serialization_settings")
            .select("*")
            .eq("site_id", curr.site_id)
            .eq("financial_year", fy)
            .eq("order_kind", kindForSerial)
            .maybeSingle();

          if (!serialObj) {
            const { data: created } = await supabase.schema("procurement")
              .from("serialization_settings")
              .insert({ site_id: curr.site_id, financial_year: fy, current_number: 0, order_kind: kindForSerial })
              .select()
              .single();
            serialObj = created;
          }

          if (serialObj) {
            const nextSerial = (serialObj.current_number || 0) + 1;
            const typeCode  = (curr.order_type === 'Supply') ? 'PO' : 'WO';
            const compCode  = curr.companies?.company_code || 'CO';
            const siteCode  = currProject?.project_code || 'SITE';
            mainData.order_number = `${compCode}/${siteCode}/${typeCode}/${fy}/${nextSerial}`;

            await supabase.schema("procurement")
              .from("serialization_settings")
              .update({ current_number: nextSerial })
              .eq("id", serialObj.id);
          }
        } catch (numErr) {
          console.error("Number assignment failed:", numErr.message);
        }
      }
    }

    // When order gets issued and has a real order number, move files from PENDING folder to proper folder
    if (mainData.status === 'Issued' && mainData.order_number && mainData.order_number.includes('/')) {
      const moveStorageFile = async (currentUrl, subfolder) => {
        if (!currentUrl) return currentUrl;
        const currentPath = normalizeStoragePath(currentUrl, 'procurement-docs');
        if (!currentPath || !isDraftNumber(currentPath.split('/')[1])) return currentUrl;
        const fileName = currentPath.split('/').pop();
        const newPath = `orders/${mainData.order_number}/${subfolder}/${fileName}`;
        try {
          const { error } = await supabase.storage.from('procurement-docs').move(currentPath, newPath);
          if (error) throw error;
          return newPath;
        } catch (e) {
          console.error(`[Storage Move] Failed: ${currentPath} → ${newPath}:`, e.message);
          return currentUrl;
        }
      };

      const [movedQuotation, movedComparative] = await Promise.all([
        moveStorageFile(existing.quotation_url, 'quotations'),
        moveStorageFile(existing.comparative_sheet_url, 'comparative'),
      ]);
      if (movedQuotation   !== existing.quotation_url)          quotationUrl   = movedQuotation;
      if (movedComparative !== existing.comparative_sheet_url)  comparativeUrl = movedComparative;
    }

    // If this is a status-only update and totals are missing, auto-calculate from existing items
    if (!itemsProvided && (!mainData.totals || !Number(mainData.totals?.subtotal))) {
      const { data: existingOrder } = await supabase.schema("procurement")
        .from("purchase_orders").select("totals").eq("id", req.params.id).single();

      if (!existingOrder?.totals || !Number(existingOrder.totals?.subtotal)) {
        const { data: itsRows } = await supabase.schema("procurement")
          .from("purchase_order_items")
          .select("qty, unit_rate, tax_pct, discount_pct, amount")
          .eq("order_id", req.params.id);

        if (itsRows && itsRows.length > 0) {
          const subtotal = itsRows.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0), 0);
          const itemsDiscSum = itsRows.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_rate) * (Number(it.discount_pct) || 0) / 100), 0);
          const itemGst = itsRows.reduce((s, it) => {
            const net = (Number(it.qty) * Number(it.unit_rate)) * (1 - (Number(it.discount_pct) || 0) / 100);
            return s + (net * (Number(it.tax_pct) || 0) / 100);
          }, 0);

          const existingT = existingOrder?.totals || {};
          const fAmt = Number(existingT.frightCharges || existingT.fright || 0);
          const fTax = Number(existingT.frightTax || 0);
          const fGst = fAmt * (fTax / 100);

          mainData.totals = {
            ...existingT,
            ...(mainData.totals || {}),
            subtotal,
            totalDiscountAmt: itemsDiscSum,
            gst: itemGst + fGst,
            grandTotal: Math.round(subtotal - itemsDiscSum + fAmt + itemGst + fGst),
          };
        }
      }
    }

    const { error: orderErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ ...mainData, quotation_url: quotationUrl, comparative_sheet_url: comparativeUrl, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (orderErr) throw orderErr;

    // Notify all connected inbox clients instantly when order status changes
    if (mainData.status) broadcast({ type: "order_updated", status: mainData.status });

    // Replace items ONLY if the caller explicitly sent an items array.
    // Status-only updates (Cancel / Send to Approval / Amend Request flip)
    // omit `items` entirely so the existing rows must stay untouched.
    if (itemsProvided) {
      await supabase.schema("procurement").from("purchase_order_items").delete().eq("order_id", req.params.id);
      if (items.length > 0) {
        const itemInserts = items.map(it => ({ ...it, order_id: req.params.id }));
        const { error: itemErr } = await supabase.schema("procurement").from("purchase_order_items").insert(itemInserts);
        if (itemErr) throw itemErr;
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Order update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   PDF GENERATION (Puppeteer)
   ════════════════════════════════════ */
const { renderPdf } = require("../services/pdfService");
const { renderOrderHtml, renderHeaderTemplate, renderFooterTemplate, renderPreviewHeader } = require("../pdf/orderTemplate");

const loadOrderForRender = async (orderId) => {
  if (isHistoryId(orderId)) {
    const historical = await loadHistoryOrder(orderId);
    if (!historical) throw new Error("History snapshot not found");
    const cleanOrder = historical.order;
    const cleanItems = historical.items || [];
    const comp = cleanOrder.companies || cleanOrder.snapshot?.company || {};
    const vend = cleanOrder.vendors || cleanOrder.snapshot?.vendor || {};
    const site = cleanOrder.sites || cleanOrder.snapshot?.site || {};
    const contacts = cleanOrder.snapshot?.contacts || [];
    return { cleanOrder, cleanItems, comp, vend, site, contacts };
  }

  const [orderRes, itemRes] = await Promise.all([
    supabase.schema("procurement")
      .from("purchase_orders")
      .select("*, companies(*), vendors(*), contact_person:contacts(*)")
      .eq("id", orderId)
      .single(),
    supabase.schema("procurement")
      .from("purchase_order_items")
      .select("*, items(*)")
      .eq("order_id", orderId),
  ]);
  if (orderRes.error) throw orderRes.error;
  if (itemRes.error) throw itemRes.error;
  const order = orderRes.data;
  const items = itemRes.data;

  const cleanOrder = sanitizeRichTextDeep(order);
  const cleanItems = sanitizeRichTextDeep(items || []).map((row) => ({
    ...row,
    material_name: row.material_name || row.items?.material_name,
  }));
  const comp = cleanOrder.companies || {};
  const vend = cleanOrder.vendors || {};
  const site = cleanOrder.sites || cleanOrder.snapshot?.site || {};
  // Mirror ViewOrder logic: snapshot contacts first, fallback to live JOIN
  const snapContacts = cleanOrder.snapshot?.contacts;
  const liveContact = cleanOrder.contact_person;
  const finalContacts = (snapContacts && snapContacts.length > 0)
    ? snapContacts
    : liveContact ? [liveContact] : [];

  const issuedByRaw = cleanOrder.totals?.issuedBy || null;
  return { cleanOrder, cleanItems, comp, vend, site, contacts: finalContacts, issuedByRaw };
};

const previewHtmlCache = new Map();
const PREVIEW_CACHE_MAX = 50;

router.get("/:id/preview", async (req, res) => {
  try {
    const { cleanOrder, cleanItems, comp, vend, site, contacts, issuedByRaw } = await loadOrderForRender(req.params.id);

    const cacheKey = `${cleanOrder.id}__${cleanOrder.updated_at || cleanOrder.created_at || ""}`;
    let html = previewHtmlCache.get(cacheKey);

    if (!html) {
      const [logoDataUri, stampDataUri, signDataUri, issuerSignDataUri] = await Promise.all([
        fetchAsDataUri(comp.logo_url || comp.logoUrl),
        fetchAsDataUri(comp.stamp_url || comp.stampUrl),
        fetchAsDataUri(comp.sign_url || comp.signUrl),
        fetchSignatureDataUri(issuedByRaw?.signatureFile),
      ]);
      const compWithImages = { ...comp, stampDataUri, signDataUri };
      const issuer = issuedByRaw ? { ...issuedByRaw, signDataUri: issuerSignDataUri } : null;
      html = renderOrderHtml(
        {
          order: cleanOrder,
          items: cleanItems,
          comp: compWithImages,
          vend,
          site,
          contacts,
          issuer,
          previewHeaderHtml: renderPreviewHeader(cleanOrder, comp, logoDataUri),
        },
        { preview: true }
      );
      if (previewHtmlCache.size >= PREVIEW_CACHE_MAX) previewHtmlCache.delete(previewHtmlCache.keys().next().value);
      previewHtmlCache.set(cacheKey, html);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.end(html);
  } catch (err) {
    console.error("PDF preview error:", err);
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

const logoCache = new Map();
const LOGO_TTL_MS = 24 * 60 * 60 * 1000;

let sharp = null;
try { sharp = require("sharp"); } catch { console.warn("sharp not available — images embedded without compression"); }

const compressImage = async (buf) => {
  if (!sharp) return { buf, ct: "image/png" };
  try {
    const img = sharp(buf, { failOn: "none" });
    const meta = await img.metadata();
    const MAX = 500;
    if ((meta.width || 0) > MAX) img.resize({ width: MAX, withoutEnlargement: true });
    if (meta.hasAlpha) {
      const out = await img.png({ compressionLevel: 9, palette: true }).toBuffer();
      return { buf: out, ct: "image/png" };
    }
    const out = await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return { buf: out, ct: "image/jpeg" };
  } catch (e) {
    console.warn("Image compress failed, using original:", e.message);
    return { buf, ct: "image/png" };
  }
};

const fetchAsDataUri = async (url) => {
  if (!url) return "";
  const cached = logoCache.get(url);
  if (cached && Date.now() - cached.t < LOGO_TTL_MS) return cached.v;
  try {
    let rawBuf;
    if (!/^https?:/i.test(String(url)) || String(url).includes("/storage/v1/object/")) {
      const path = normalizeStoragePath(url, "procurement-images");
      const { data, error } = await supabase.storage.from("procurement-images").download(path);
      if (error || !data) return "";
      rawBuf = Buffer.from(await data.arrayBuffer());
    } else {
      const r = await fetch(url);
      if (!r.ok) return "";
      rawBuf = Buffer.from(await r.arrayBuffer());
    }
    const { buf, ct } = await compressImage(rawBuf);
    const v = `data:${ct};base64,${buf.toString("base64")}`;
    logoCache.set(url, { v, t: Date.now() });
    return v;
  } catch (e) {
    console.warn("Logo fetch failed:", e.message);
    return "";
  }
};

const fetchSignatureDataUri = async (filename) => {
  if (!filename) return "";
  try {
    const { data, error } = await supabase.storage.from("avatars").download(filename);
    if (error || !data) return "";
    const rawBuf = Buffer.from(await data.arrayBuffer());
    const { buf, ct } = await compressImage(rawBuf);
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn("Issuer signature fetch failed:", e.message);
    return "";
  }
};

const pdfCache = new Map();
const PDF_CACHE_MAX = 50;

router.get("/:id/pdf", async (req, res) => {
  try {
    const { cleanOrder, cleanItems, comp, vend, site, contacts, issuedByRaw } = await loadOrderForRender(req.params.id);
    const [logoDataUri, stampDataUri, signDataUri, issuerSignDataUri] = await Promise.all([
      fetchAsDataUri(comp.logo_url || comp.logoUrl),
      fetchAsDataUri(comp.stamp_url || comp.stampUrl),
      fetchAsDataUri(comp.sign_url || comp.signUrl),
      fetchSignatureDataUri(issuedByRaw?.signatureFile),
    ]);
    const compWithImages = { ...comp, stampDataUri, signDataUri };
    const issuer = issuedByRaw ? { ...issuedByRaw, signDataUri: issuerSignDataUri } : null;
    const html = renderOrderHtml({ order: cleanOrder, items: cleanItems, comp: compWithImages, vend, site, contacts, issuer });
    const headerTemplate = renderHeaderTemplate(cleanOrder, comp, logoDataUri);
    const footerTemplate = renderFooterTemplate(comp);
    const cacheKey = crypto
      .createHash("sha1")
      .update([
        cleanOrder.id,
        cleanOrder.updated_at || cleanOrder.created_at || "",
        html,
        headerTemplate,
        footerTemplate,
      ].join("__"))
      .digest("hex");

    let pdfBuffer = pdfCache.get(cacheKey);
    if (!pdfBuffer) {
      pdfBuffer = await renderPdf(html, {
        headerTemplate,
        footerTemplate,
      });
      if (pdfCache.size >= PDF_CACHE_MAX) pdfCache.delete(pdfCache.keys().next().value);
      pdfCache.set(cacheKey, pdfBuffer);
    }

    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const filenameBase = String(cleanOrder.order_number || "order").trim().replace(/\.pdf$/i, "") || "order";
    const filename = `${filenameBase}.pdf`.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (isHistoryId(req.params.id)) {
      return res.status(400).json({ error: "History snapshots cannot be deleted" });
    }
    const { data: order, error: orderErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("status, snapshot")
      .eq("id", req.params.id)
      .single();
    if (orderErr) throw orderErr;
    if (order?.status === "Deleted") {
      return res.status(400).json({ error: "Order is already in Trash." });
    }
    if (!["Draft", "Review"].includes(order?.status)) {
      return res.status(400).json({ error: `${order.status} orders cannot be moved to Trash` });
    }
    const deleted_by = req.query.deleted_by || req.body?.deleted_by || "Unknown";
    const deleted_at = new Date().toISOString();
    const actLog = Array.isArray(order.snapshot?.activity_log) ? [...order.snapshot.activity_log] : [];
    actLog.push({
      action: "Deleted",
      action_by: deleted_by,
      action_at: deleted_at,
      comments: `Moved to Trash from ${order.status || "Unknown"}`,
    });
    const newSnapshot = {
      ...(order.snapshot || {}),
      activity_log: actLog,
      _deleted: { original_status: order.status, deleted_by, deleted_at }
    };
    const { error } = await supabase.schema("procurement").from("purchase_orders")
      .update({ status: "Deleted", snapshot: newSnapshot, updated_at: deleted_at }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   POST-PO DOCUMENTS  (live, editable after issue)
   Categories: quotations, comparative, vendor-docs, other, vendor-acceptance
   ════════════════════════════════════ */

const POST_DOC_CATEGORIES = ["quotations", "comparative", "vendor-docs", "other", "vendor-acceptance", "signed-copy", "vendor-invoice"];

/* ─────────────────────────────────────────
   POST /api/orders/upload
   Generic file upload helper — used by amendment-request proof attachments and
   any other order-adjacent flow that just needs to store a file and get a URL.
───────────────────────────────────────── */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File is required" });
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const orderNumber = (req.body.order_number || "").trim();
    const folder = orderNumber ? `orders/amendments/${orderNumber}` : "orders/amendments";
    const storagePath = `${folder}/${Date.now()}_${safeName}`;
    const url = await uploadToStorage("procurement-docs", storagePath, req.file.buffer, req.file.mimetype);
    res.json({ success: true, url, storage_path: url, name: req.file.originalname, size: req.file.size });
  } catch (err) {
    console.error("Generic order upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/post-documents", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const category = (req.body.category || "").trim();
    const uploadedById   = req.body.uploadedById   || null;
    const uploadedByName = req.body.uploadedByName || "Unknown";
    if (!POST_DOC_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Allowed: ${POST_DOC_CATEGORIES.join(", ")}` });
    }
    if (!req.file) return res.status(400).json({ error: "File is required" });

    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("order_number, post_documents")
      .eq("id", id).single();
    if (ordErr) throw ordErr;

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `orders/${order.order_number || id}/post/${category}/${Date.now()}_${safeName}`;
    const url = await uploadToStorage("procurement-docs", storagePath, req.file.buffer, req.file.mimetype);

    const newDoc = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      category,
      url,
      storage_path: storagePath,
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploaded_at: new Date().toISOString(),
      uploaded_by_id: uploadedById,
      uploaded_by_name: uploadedByName,
    };

    const existingArr = Array.isArray(order.post_documents) ? order.post_documents : [];
    const nextArr = [...existingArr, newDoc];

    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ post_documents: nextArr })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true, document: { ...newDoc, url: await signOrderDocUrl(newDoc.url) } });
  } catch (err) {
    console.error("Post-doc upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/post-documents/:docId", async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("post_documents")
      .eq("id", id).single();
    if (ordErr) throw ordErr;

    const arr = Array.isArray(order.post_documents) ? order.post_documents : [];
    const target = arr.find(d => d.id === docId);
    if (!target) return res.status(404).json({ error: "Document not found" });

    // Delete from storage (best-effort)
    if (target.storage_path) {
      await supabase.storage.from("procurement-docs").remove([target.storage_path])
        .catch(err => console.warn("Storage delete warning:", err.message));
    }

    const next = arr.filter(d => d.id !== docId);
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ post_documents: next })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true });
  } catch (err) {
    console.error("Post-doc delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────
   SIGNED COPY  (vendor accepted copy — max 1 doc)
   POST   /api/orders/:id/signed-copy   → upload or replace
   DELETE /api/orders/:id/signed-copy   → delete
───────────────────────────────────────── */
router.post("/:id/signed-copy", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "File is required" });

    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("order_number, post_documents")
      .eq("id", id).single();
    if (ordErr) throw ordErr;

    const existingArr = Array.isArray(order.post_documents) ? order.post_documents : [];

    // Delete old signed copy from storage (best-effort)
    const old = existingArr.find(d => d.category === "signed-copy");
    if (old?.storage_path) {
      await supabase.storage.from("procurement-docs").remove([old.storage_path])
        .catch(e => console.warn("Signed-copy storage delete warning:", e.message));
    }

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `orders/${order.order_number || id}/signed-copy/${Date.now()}_${safeName}`;
    const url = await uploadToStorage("procurement-docs", storagePath, req.file.buffer, req.file.mimetype);

    const newDoc = {
      id: `signed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      category: "signed-copy",
      url,
      storage_path: storagePath,
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploaded_at: new Date().toISOString(),
    };

    const nextArr = [...existingArr.filter(d => d.category !== "signed-copy"), newDoc];
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ post_documents: nextArr })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true, document: newDoc });
  } catch (err) {
    console.error("Signed-copy upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/signed-copy", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("post_documents")
      .eq("id", id).single();
    if (ordErr) throw ordErr;

    const arr = Array.isArray(order.post_documents) ? order.post_documents : [];
    const target = arr.find(d => d.category === "signed-copy");
    if (!target) return res.status(404).json({ error: "No signed copy found" });

    if (target.storage_path) {
      await supabase.storage.from("procurement-docs").remove([target.storage_path])
        .catch(e => console.warn("Signed-copy storage delete warning:", e.message));
    }

    const next = arr.filter(d => d.category !== "signed-copy");
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ post_documents: next })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true });
  } catch (err) {
    console.error("Signed-copy delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────
   Vendor Invoices  (structured invoice entries stored in vendor_invoices JSONB)
   GET    /api/orders/:id/vendor-invoices
   POST   /api/orders/:id/vendor-invoices
   DELETE /api/orders/:id/vendor-invoices/:invoiceId
───────────────────────────────────────── */

async function appendAuditLog(orderId, entries) {
  const { data: order } = await supabase.schema("procurement")
    .from("purchase_orders").select("invoice_audit_log").eq("id", orderId).single();
  const current = Array.isArray(order?.invoice_audit_log) ? order.invoice_audit_log : [];
  await supabase.schema("procurement")
    .from("purchase_orders")
    .update({ invoice_audit_log: [...current, ...entries] })
    .eq("id", orderId);
}

/* GET global audit log */
router.get("/:id/invoice-audit-log", async (req, res) => {
  try {
    const { data: order, error } = await supabase.schema("procurement")
      .from("purchase_orders").select("invoice_audit_log").eq("id", req.params.id).single();
    if (error) throw error;
    res.json({ log: Array.isArray(order.invoice_audit_log) ? order.invoice_audit_log : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* DELETE all entries for one invoice from audit log */
router.delete("/:id/invoice-audit-log/invoice/:invoiceId", async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const { data: order, error } = await supabase.schema("procurement")
      .from("purchase_orders").select("invoice_audit_log").eq("id", id).single();
    if (error) throw error;
    const current = Array.isArray(order.invoice_audit_log) ? order.invoice_audit_log : [];
    const filtered = current.filter(e => e.invoice_id !== invoiceId);
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders").update({ invoice_audit_log: filtered }).eq("id", id);
    if (updErr) throw updErr;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* DELETE entire audit log */
router.delete("/:id/invoice-audit-log", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement")
      .from("purchase_orders").update({ invoice_audit_log: [] }).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get("/:id/vendor-invoices", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: order, error } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices")
      .eq("id", id)
      .single();
    if (error) throw error;
    const invoices = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const signed = await Promise.all(invoices.map(async inv => ({
      ...inv,
      docs: await Promise.all((inv.docs || []).map(async d => ({
        ...d,
        url: await signOrderDocUrl(d.storage_path || d.url),
      }))),
    })));
    res.json({ invoices: signed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/vendor-invoices", async (req, res) => {
  try {
    const { id } = req.params;
    const { invoice_no, invoice_date, amount, items, remarks, created_by } = req.body;

    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices")
      .eq("id", id)
      .single();
    if (ordErr) throw ordErr;

    const now = new Date().toISOString();
    const byUser = String(created_by || "Unknown");
    const newInvoice = {
      id: `inv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      invoice_no: String(invoice_no || "").trim(),
      invoice_date: invoice_date || null,
      amount: Number(amount) || 0,
      remarks: String(remarks || "").trim(),
      items: Array.isArray(items) ? items : [],
      docs: [],
      created_by: byUser,
      created_at: now,
      log: [{ action: "Invoice Created", user: byUser, at: now }],
    };

    const existing = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ vendor_invoices: [...existing, newInvoice] })
      .eq("id", id);
    if (updErr) throw updErr;

    await appendAuditLog(id, [{ invoice_id: newInvoice.id, invoice_no: newInvoice.invoice_no, action: "Invoice Created", user: byUser, at: now }]);

    res.json({ success: true, invoice: newInvoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import — accepts array of invoice objects
router.post("/:id/vendor-invoices/bulk", async (req, res) => {
  try {
    const { id } = req.params;
    const { invoices: incoming } = req.body;
    if (!Array.isArray(incoming) || incoming.length === 0)
      return res.status(400).json({ error: "No invoices provided" });

    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices")
      .eq("id", id)
      .single();
    if (ordErr) throw ordErr;

    const newInvoices = incoming.map(inv => ({
      id: `inv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      invoice_no: String(inv.invoice_no || "").trim(),
      invoice_date: inv.invoice_date || null,
      remarks: String(inv.remarks || "").trim(),
      items: Array.isArray(inv.items) ? inv.items : [],
      docs: [],
      created_at: new Date().toISOString(),
    }));

    const existing = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ vendor_invoices: [...existing, ...newInvoices] })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true, count: newInvoices.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/vendor-invoices/:invoiceId", async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const byUser = String(req.body?.deleted_by || req.query?.deleted_by || "Unknown");
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices")
      .eq("id", id)
      .single();
    if (ordErr) throw ordErr;

    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const target = arr.find(inv => inv.id === invoiceId);
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ vendor_invoices: arr.filter(inv => inv.id !== invoiceId) })
      .eq("id", id);
    if (updErr) throw updErr;

    if (target) {
      const now = new Date().toISOString();
      const preserved = (target.log || []).map(e => ({ ...e, invoice_id: invoiceId, invoice_no: target.invoice_no }));
      await appendAuditLog(id, [...preserved, { invoice_id: invoiceId, invoice_no: target.invoice_no, action: "Permanently Deleted", user: byUser, at: now }]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update (edit) a vendor invoice
router.put("/:id/vendor-invoices/:invoiceId", async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const { invoice_no, invoice_date, remarks, items, updated_by, amount, trashed, charges } = req.body;

    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices")
      .eq("id", id)
      .single();
    if (ordErr) throw ordErr;

    const now = new Date().toISOString();
    const byUser = String(updated_by || "Unknown");
    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const updated = arr.map(inv => {
      if (inv.id !== invoiceId) return inv;
      // trashed-only update (no log entry needed for trash/restore)
      if (trashed !== undefined && invoice_no === undefined) {
        return { ...inv, trashed: Boolean(trashed), trashed_at: trashed ? now : null };
      }
      const changes = [];
      const newNo = String(invoice_no || inv.invoice_no || "").trim();
      if (invoice_no !== undefined && newNo !== String(inv.invoice_no || "").trim())
        changes.push(`Invoice No: "${inv.invoice_no}" → "${newNo}"`);
      if (invoice_date !== undefined && invoice_date !== inv.invoice_date)
        changes.push(`Date: ${inv.invoice_date || '—'} → ${invoice_date || '—'}`);
      if (amount !== undefined && Number(amount) !== Number(inv.amount || 0))
        changes.push(`Amount: ${inv.amount || 0} → ${Number(amount)}`);
      if (Array.isArray(items) && JSON.stringify(items) !== JSON.stringify(inv.items || []))
        changes.push(`Items updated (${items.length} line item${items.length !== 1 ? 's' : ''})`);
      const action = changes.length > 0 ? `Updated — ${changes.join(', ')}` : 'Details updated';
      const logEntry = { action, user: byUser, at: now };
      return { ...inv,
        invoice_no: newNo,
        invoice_date: invoice_date !== undefined ? invoice_date : inv.invoice_date,
        amount: amount !== undefined ? Number(amount) : inv.amount,
        remarks: String(remarks !== undefined ? remarks : (inv.remarks || "")),
        items: Array.isArray(items) ? items : inv.items,
        charges: Array.isArray(charges) ? charges : (inv.charges || []),
        log: [...(inv.log || []), logEntry],
      };
    });

    const { data: updData, error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ vendor_invoices: updated })
      .eq("id", id)
      .select("vendor_invoices");
    if (updErr) throw updErr;
    const savedInv = (updData?.[0]?.vendor_invoices || []).find(i => i.id === invoiceId);
    if (savedInv && invoice_no !== undefined) {
      const logEntry = savedInv.log?.[savedInv.log.length - 1];
      if (logEntry) await appendAuditLog(id, [{ invoice_id: invoiceId, invoice_no: savedInv.invoice_no, action: logEntry.action, user: byUser, at: now }]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated trash/restore endpoint
router.post("/:id/vendor-invoices/:invoiceId/trash", async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const trash = req.body.trashed !== false;

    const { data: order, error: readErr } = await supabase
      .schema("procurement").from("purchase_orders")
      .select("vendor_invoices").eq("id", id).single();
    if (readErr) return res.status(404).json({ error: "Order not found" });

    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    let found = false;
    const now = new Date().toISOString();
    const byUser = String(req.body.by || "Unknown");
    const updated = arr.map(inv => {
      if (inv.id !== invoiceId) return inv;
      found = true;
      const action = trash ? "Moved to Trash" : "Restored from Trash";
      const logEntry = { action, user: byUser, at: now };
      return { ...inv, trashed: trash, log: [...(inv.log || []), logEntry] };
    });
    if (!found) return res.status(404).json({ error: "Invoice not found" });

    const { error: writeErr } = await supabase
      .schema("procurement").from("purchase_orders")
      .update({ vendor_invoices: updated }).eq("id", id);
    if (writeErr) return res.status(500).json({ error: writeErr.message });

    const affectedInv = updated.find(i => i.id === invoiceId);
    const action = trash ? "Moved to Trash" : "Restored from Trash";
    await appendAuditLog(id, [{ invoice_id: invoiceId, invoice_no: affectedInv?.invoice_no || invoiceId, action, user: byUser, at: now }]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft-patch invoice fields (e.g. trashed: true)
router.patch("/:id/vendor-invoices/:invoiceId", async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const patches = req.body;

    // Read current order
    const { data: order, error: ordErr } = await supabase
      .schema("procurement").from("purchase_orders")
      .select("id, vendor_invoices").eq("id", id).single();
    if (ordErr) return res.status(404).json({ error: "Order not found: " + ordErr.message });

    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const targetIdx = arr.findIndex(inv => inv.id === invoiceId);
    if (targetIdx === -1) return res.status(404).json({ error: `Invoice ${invoiceId} not found in order ${id}` });

    const updated = arr.map((inv, i) => i === targetIdx ? { ...inv, ...patches } : inv);

    const { error: updErr } = await supabase
      .schema("procurement").from("purchase_orders")
      .update({ vendor_invoices: updated }).eq("id", id);
    if (updErr) return res.status(500).json({ error: "Update failed: " + updErr.message });

    res.json({ success: true, invoiceId, patches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk permanent delete invoices (from trash)
router.delete("/:id/vendor-invoices", async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceIds, deleted_by } = req.body;
    const byUser = String(deleted_by || "Unknown");
    if (!Array.isArray(invoiceIds) || !invoiceIds.length)
      return res.status(400).json({ error: "invoiceIds required" });
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders").select("vendor_invoices").eq("id", id).single();
    if (ordErr) throw ordErr;
    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const toDelete = arr.filter(inv => invoiceIds.includes(inv.id));
    await Promise.allSettled(toDelete.flatMap(inv =>
      (inv.docs || []).map(async d => {
        const path = d.storage_path || normalizeStoragePath(d.url, "procurement-docs");
        if (path) await removeStorageFile(supabase, "procurement-docs", path);
      })
    ));
    const updated = arr.filter(inv => !invoiceIds.includes(inv.id));
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders").update({ vendor_invoices: updated }).eq("id", id);
    if (updErr) throw updErr;

    const now = new Date().toISOString();
    const auditEntries = toDelete.flatMap(inv => [
      ...(inv.log || []).map(e => ({ ...e, invoice_id: inv.id, invoice_no: inv.invoice_no })),
      { invoice_id: inv.id, invoice_no: inv.invoice_no, action: "Permanently Deleted", user: byUser, at: now },
    ]);
    if (auditEntries.length > 0) await appendAuditLog(id, auditEntries);

    res.json({ success: true, deleted: toDelete.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bill Docs per invoice
router.post("/:id/vendor-invoices/:invoiceId/docs", upload.single("file"), async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices, order_number")
      .eq("id", id)
      .single();
    if (ordErr) throw ordErr;

    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const invIdx = arr.findIndex(inv => inv.id === invoiceId);
    if (invIdx === -1) return res.status(404).json({ error: "Invoice not found" });

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `orders/${order.order_number || id}/vendor-invoices/${invoiceId}/${Date.now()}_${safeName}`;
    await uploadToStorage("procurement-docs", storagePath, file.buffer, file.mimetype);

    const newDoc = {
      id: `doc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      name: file.originalname,
      storage_path: storagePath,
      size: file.size,
      doc_type: req.body.doc_type || 'invoice',
      uploaded_at: new Date().toISOString(),
    };

    const logEntry = { action: `Document uploaded: ${file.originalname}`, user: String(req.body.uploaded_by || "Unknown"), at: newDoc.uploaded_at };
    const updated = arr.map((inv, i) => i === invIdx
      ? { ...inv, docs: [...(inv.docs || []), newDoc], log: [...(inv.log || []), logEntry] }
      : inv
    );

    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ vendor_invoices: updated })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true, doc: newDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft-trash a doc (mark trashed: true without deleting from storage)
router.patch("/:id/vendor-invoices/:invoiceId/docs/:docId", async (req, res) => {
  try {
    const { id, invoiceId, docId } = req.params;
    const patches = req.body;
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders").select("vendor_invoices").eq("id", id).single();
    if (ordErr) throw ordErr;
    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const updated = arr.map(inv => inv.id === invoiceId
      ? { ...inv, docs: (inv.docs || []).map(d => d.id === docId ? { ...d, ...patches } : d) }
      : inv
    );
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders").update({ vendor_invoices: updated }).eq("id", id);
    if (updErr) throw updErr;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk permanent delete (empty trash / delete selected)
router.delete("/:id/vendor-invoices/:invoiceId/docs", async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const { docIds } = req.body;
    if (!Array.isArray(docIds) || !docIds.length) return res.status(400).json({ error: "docIds required" });
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders").select("vendor_invoices").eq("id", id).single();
    if (ordErr) throw ordErr;
    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const inv = arr.find(inv => inv.id === invoiceId);
    const toDelete = (inv?.docs || []).filter(d => docIds.includes(d.id));
    await Promise.allSettled(toDelete.map(async d => {
      const path = d.storage_path || normalizeStoragePath(d.url, "procurement-docs");
      if (path) await removeStorageFile(supabase, "procurement-docs", path);
    }));
    const updated = arr.map(inv => inv.id === invoiceId
      ? { ...inv, docs: (inv.docs || []).filter(d => !docIds.includes(d.id)) }
      : inv
    );
    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders").update({ vendor_invoices: updated }).eq("id", id);
    if (updErr) throw updErr;
    res.json({ success: true, deleted: toDelete.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id/vendor-invoices/:invoiceId/docs/:docId", async (req, res) => {
  try {
    const { id, invoiceId, docId } = req.params;
    const { data: order, error: ordErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("vendor_invoices")
      .eq("id", id)
      .single();
    if (ordErr) throw ordErr;

    const arr = Array.isArray(order.vendor_invoices) ? order.vendor_invoices : [];
    const inv = arr.find(inv => inv.id === invoiceId);
    const doc = (inv?.docs || []).find(d => d.id === docId);
    if (doc) {
      const path = doc.storage_path || normalizeStoragePath(doc.url, "procurement-docs");
      if (path) await removeStorageFile(supabase, "procurement-docs", path);
    }

    const updated = arr.map(inv => inv.id === invoiceId
      ? { ...inv, docs: (inv.docs || []).filter(d => d.id !== docId) }
      : inv
    );

    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update({ vendor_invoices: updated })
      .eq("id", id);
    if (updErr) throw updErr;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────
   POST /api/orders/:id/issue-action
   Issue handler acts on a "Pending Issue" order: issue | revert | reject
───────────────────────────────────────── */
router.post("/:id/issue-action", async (req, res) => {
  const { action, comment } = req.body; // action: "issue" | "revert" | "reject"
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  let userId;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    userId = payload.sub;
  } catch { return res.status(401).json({ error: "Invalid token" }); }

  if (!["issue", "revert", "reject"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    const { data: user } = await supabase.from("users")
      .select("name, role, designation, profile_permissions").eq("id", userId).single();
    const isGlobalAdmin = user?.role === "global_admin";

    if (!isGlobalAdmin) {
      const { data: handler } = await supabase.from("request_handlers")
        .select("users").eq("module_key", "order").eq("action_key", "issue").maybeSingle();
      const isHandler = (handler?.users || []).some(u => String(u.id) === String(userId));
      if (!isHandler) return res.status(403).json({ error: "You are not the designated issue handler" });
    }

    const { data: order } = await supabase.schema("procurement").from("purchase_orders")
      .select("status, snapshot, totals, order_number, order_type, site_id, companies(company_code)")
      .eq("id", req.params.id).single();
    if (!order || !["Pending Issue", "To Issue"].includes(order.status)) {
      return res.status(400).json({ error: "Order is not in Pending Issue state" });
    }

    const now = new Date().toISOString();
    const snap = order.snapshot || {};
    const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];

    const newStatus = action === "issue" ? "Issued" : action === "revert" ? "Review" : "Rejected";
    const actionLabel = action === "issue" ? "Issued" : action === "revert" ? "Reverted" : "Rejected";
    actLog.push({
      action: actionLabel,
      action_by: user?.name || "",
      action_at: now,
      ...(comment ? { comments: comment } : {}),
    });

    const updatePayload = { status: newStatus, snapshot: { ...snap, activity_log: actLog }, updated_at: now };

    if (action === "issue") {
      const issuedBy = {
        id:            userId,
        name:          user?.name || "",
        designation:   user?.designation || "",
        signatureFile: user?.profile_permissions?.ui?.signature || null,
      };
      updatePayload.totals = { ...(order.totals || {}), issuedBy, issuedAt: now };

      // Assign final order number if still a draft number
      if (isDraftNumber(order.order_number) && order.site_id) {
        try {
          const fy = getFinancialYear();
          const kindForSerial = order.order_type === "Supply" ? "Supply" : "SITC";
          let { data: serialObj } = await supabase.schema("procurement")
            .from("serialization_settings")
            .select("*")
            .eq("site_id", order.site_id)
            .eq("financial_year", fy)
            .eq("order_kind", kindForSerial)
            .maybeSingle();

          if (!serialObj) {
            const { data: created } = await supabase.schema("procurement")
              .from("serialization_settings")
              .insert({ site_id: order.site_id, financial_year: fy, current_number: 0, order_kind: kindForSerial })
              .select().single();
            serialObj = created;
          }

          if (serialObj) {
            const nextSerial = (serialObj.current_number || 0) + 1;
            const typeCode  = order.order_type === "Supply" ? "PO" : "WO";
            const compCode  = order.companies?.company_code || "CO";
            const { data: issueProject } = order.site_id
              ? await supabase.from("projects").select("project_code").eq("id", order.site_id).single()
              : { data: null };
            const siteCode  = issueProject?.project_code || order.snapshot?.site?.siteCode || "SITE";
            updatePayload.order_number = `${compCode}/${siteCode}/${typeCode}/${fy}/${nextSerial}`;
            await supabase.schema("procurement").from("serialization_settings")
              .update({ current_number: nextSerial }).eq("id", serialObj.id);
          }
        } catch (numErr) {
          console.error("Order number assignment failed:", numErr.message);
        }
      }
    }

    await supabase.schema("procurement").from("purchase_orders")
      .update(updatePayload).eq("id", req.params.id);

    broadcast({ type: "order_updated" });
    res.json({ success: true, newStatus, order_number: updatePayload.order_number });
  } catch (err) {
    console.error("POST /orders/:id/issue-action failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
