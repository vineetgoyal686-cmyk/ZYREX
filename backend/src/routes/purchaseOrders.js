const crypto = require("crypto");
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const {
  normalizeStoragePath,
  uploadStorageFile,
  createSignedStorageUrl,
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

const HISTORY_ID_PREFIX = "history:";
const isHistoryId = (id = "") => String(id).startsWith(HISTORY_ID_PREFIX);
const getHistoryRows = (order = {}) => Array.isArray(order.snapshot?.status_history) ? order.snapshot.status_history : [];
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
    .select("*, sites(*), companies(*), vendors(*), contact_person:contacts(*)");
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
      .select("*, sites(*), companies(*), vendors(*), contact_person:contacts(*)")
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
  const [
    quotationUrl,
    comparativeSheetUrl,
    preDocuments,
    postDocuments,
    companies,
    vendors,
    snapshotCompany,
    snapshotVendor,
  ] = await Promise.all([
    signOrderDocUrl(order.quotation_url),
    signOrderDocUrl(order.comparative_sheet_url),
    signDocArray(order.pre_documents),
    signDocArray(order.post_documents),
    order.companies ? signCompanyImages(order.companies) : Promise.resolve(order.companies),
    order.vendors ? signVendorDocs(order.vendors) : Promise.resolve(order.vendors),
    snapshot.company ? signCompanyImages(snapshot.company) : Promise.resolve(snapshot.company),
    snapshot.vendor ? signVendorDocs(snapshot.vendor) : Promise.resolve(snapshot.vendor),
  ]);

  if (snapshot.company) snapshot.company = snapshotCompany;
  if (snapshot.vendor) snapshot.vendor = snapshotVendor;

  return {
    ...order,
    quotation_url: quotationUrl,
    comparative_sheet_url: comparativeSheetUrl,
    pre_documents: preDocuments,
    post_documents: postDocuments,
    companies,
    vendors,
    snapshot,
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
    const { data: site } = await supabase.schema("procurement").from("sites").select("site_code").eq("id", siteId).single();
    const sCode = site?.site_code || "SITE";

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

router.get("/serialization", async (req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement")
      .from("serialization_settings").select("*, sites(site_name, site_code)");
    if (error) throw error;
    res.json({ configs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/serialization", async (req, res) => {
  try {
    const { site_id, current_number, financial_year, order_kind } = req.body;
    if (!site_id || !financial_year || !order_kind) {
      return res.status(400).json({ error: "site_id, financial_year, and order_kind required" });
    }
    const kind = order_kind === "Supply" ? "Supply" : "SITC";

    const { data: existing } = await supabase.schema("procurement")
      .from("serialization_settings").select("id")
      .eq("site_id", site_id).eq("financial_year", financial_year).eq("order_kind", kind).maybeSingle();

    if (existing) {
      await supabase.schema("procurement").from("serialization_settings")
        .update({ current_number }).eq("id", existing.id);
    } else {
      await supabase.schema("procurement").from("serialization_settings")
        .insert({ site_id, financial_year, current_number, order_kind: kind });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/serialization/:id", async (req, res) => {
  try {
    const { error } = await supabase.schema("procurement")
      .from("serialization_settings").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════
   PURCHASE ORDERS CRUD
   ════════════════════════════════════ */

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement")
      .from("purchase_orders")
      .select("*, companies(*), sites(*), vendors(*)")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Supabase Error fetching orders:", error);
      throw error;
    }
    console.log(`Fetched ${data?.length || 0} orders from DB`);
    
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
      return { ...order, made_by: displayName };
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
        .select("id, order_number, order_type, status, totals, vendor_id, site_id, snapshot, created_at, date_of_creation, sites(site_code, city, state), companies(company_code), vendors(id, vendor_code, vendor_name, email, mobile, bank_city, bank_state, address, company_codes)")
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
      .select("order_id, item_id, description, items(material_name, item_code)");
    if (itemErr) throw itemErr;

    const itemsByOrder = new Map();
    (orderItems || []).forEach(row => {
      const name = row.items?.material_name || row.description || "";
      if (!name) return;
      const list = itemsByOrder.get(row.order_id) || [];
      list.push(name);
      itemsByOrder.set(row.order_id, list);
    });

    const getTaxableOrderValue = (totals = {}) => {
      const subtotal = Number(totals.subtotal) || 0;
      const discount = Number(totals.totalDiscountAmt) || 0;
      const freight = Number(totals.frightCharges ?? totals.fright) || 0;
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
        siteCode: site.site_code || site.siteCode || "",
        orderType: order.order_type || "",
        orderNo: order.order_number || "",
        item: uniqueItems.join(", "),
        orderValue: getTaxableOrderValue(order.totals || {}),
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
        `orders/${mainData.order_number}/quotation_${Date.now()}_${files.quotation[0].originalname}`,
        files.quotation[0].buffer, files.quotation[0].mimetype
      );
    }
    if (files.comparative) {
      comparativeUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/comparative_${Date.now()}_${files.comparative[0].originalname}`,
        files.comparative[0].buffer, files.comparative[0].mimetype
      );
    }

    // 1.1 Override order_number to DRAFT if not Issued
    // The official number is now assigned in approvals.js ONLY when Issued.
    if (mainData.status !== 'Issued') {
       mainData.order_number = `PENDING-${Date.now()}`;
    }

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
      .select("*, sites(*), companies(*), vendors(*), contact_person:contacts(*)")
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
    const [{ data: companies }, { data: sites }, { data: vendors }, { data: clauses }, { data: clauseVersions }, { data: contacts }] = await Promise.all([
      supabase.schema("procurement").from("companies").select("*"),
      supabase.schema("procurement").from("sites").select("*"),
      supabase.schema("procurement").from("vendors").select("*"),
      supabase.schema("procurement").from("clauses").select("*"),
      supabase.schema("procurement").from("clause_versions").select("*"),
      supabase.schema("procurement").from("contacts").select("*"),
    ]);
    const companyByCode = new Map((companies || []).map(c => [String(c.company_code || "").toUpperCase().trim(), c]));
    const siteByCode    = new Map((sites || []).map(s => [String(s.site_code || "").toUpperCase().trim(), s]));
    const vendorByCode  = new Map((vendors || []).map(v => [String(v.vendor_code || "").toUpperCase().trim(), v]));
    const vendorByName  = new Map((vendors || []).map(v => [String(v.vendor_name || "").toLowerCase().trim(), v]));
    const clauseByCode  = new Map((clauses  || []).map(c => [String(c.code || "").toUpperCase().trim(), c]));
    const contactByCode = new Map((contacts || []).map(c => [String(c.contact_code || "").toUpperCase().trim(), c]));
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

    // Group rows by order key (PO/WO number, or row index fallback)
    const groups = new Map();
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      const key = String(pick(r, ["Purchase Order No.", "Work Order No.", "Order No", "Order Number"]) || `__row_${i}`).trim();
      if (!groups.has(key)) groups.set(key, { key, headRow: r, headRowNo: rowNo, items: [] });
      groups.get(key).items.push({ r, rowNo });
    });

    const results = { inserted: 0, failed: [], orders: [] };

    for (const group of groups.values()) {
      const h = group.headRow;
      const headRowNo = group.headRowNo;
      try {
        const compCode = String(pick(h, ["Company Code"])).toUpperCase().trim();
        const siteCode = String(pick(h, ["Site Code"])).toUpperCase().trim();
        const vendCode = String(pick(h, ["Vendor ID", "Vendor Code"])).toUpperCase().trim();
        const vendName = String(pick(h, ["Vendor Name"])).trim();

        const company = companyByCode.get(compCode);
        const site = siteByCode.get(siteCode);
        const vendorMaster = (vendCode && vendorByCode.get(vendCode))
                          || (vendName && vendorByName.get(vendName.toLowerCase()));

        if (!site) throw new Error(`Site code "${siteCode}" not found in master`);
        if (!company) throw new Error(`Company code "${compCode}" not found in master`);
        if (!vendorMaster) throw new Error(`Vendor ID "${vendCode || vendName}" not found in master`);

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
            orderNumber = `PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
          siteCode: site.site_code,
          siteName: site.site_name || "",
          city: site.city || "",
          state: site.state || "",
          siteAddress: site.site_address || "",
          billingAddress: site.billing_address || "",
        };

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
        const itemRows = consolidated.map(it => ({
          material_name: it.material_name,
          description:   pointsToStorage(it._descPoints),
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
            // If contains comma or newline, split into points array; else keep as text
            if (notesText.includes(',') || notesText.includes('\n') || notesText.includes('\r')) {
              return notesText.split(/[,\r\n]+/).map(x => x.trim()).filter(Boolean);
            }
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

        results.inserted++;
        results.orders.push({ id: inserted.id, order_number: orderNumber, status });
      } catch (grpErr) {
        results.failed.push({ row: headRowNo, orderKey: group.key, reason: grpErr.message });
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
      .from("purchase_orders").select("quotation_url, comparative_sheet_url, status")
      .eq("id", req.params.id).single();

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
      mainData.status = "Draft";
      mainData.snapshot = nextSnapshot;
    }

    let quotationUrl    = existing?.quotation_url    || "";
    let comparativeUrl  = existing?.comparative_sheet_url || "";

    if (files.quotation) {
      quotationUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/quotation_${Date.now()}_${files.quotation[0].originalname}`,
        files.quotation[0].buffer, files.quotation[0].mimetype
      );
    }
    if (files.comparative) {
      comparativeUrl = await uploadToStorage(
        "procurement-docs",
        `orders/${mainData.order_number}/comparative_${Date.now()}_${files.comparative[0].originalname}`,
        files.comparative[0].buffer, files.comparative[0].mimetype
      );
    }

    // 2.1 Override order_number to DRAFT if not Issued (prevent premature numbering on Edit)
    // Exception: amendment clones (e.g. PO-4A, PO-4B) keep their assigned number — they
    // are NOT new pending orders, they're versions of an issued one.
    if (mainData.status !== 'Issued' && !mainData.order_number?.startsWith("PENDING-")) {
        const { data: curr } = await supabase.schema("procurement")
          .from("purchase_orders").select("order_number, amended_from_id").eq("id", req.params.id).single();

        if (curr?.amended_from_id) {
          // Amendment clone — keep its existing number (e.g. .../4A)
          mainData.order_number = curr.order_number;
        } else if (!curr?.order_number?.startsWith("PENDING-")) {
          mainData.order_number = `PENDING-${Date.now()}`;
        } else {
          mainData.order_number = curr.order_number; // Preserve existing pending ID
        }
    }

    // 2.2 Assign final order number when status → Issued and current number is PENDING-
    if (mainData.status === 'Issued') {
      // Stamp issuedAt into totals JSON for display
      mainData.totals = { ...(mainData.totals || {}), issuedAt: new Date().toISOString() };

      const { data: curr } = await supabase.schema("procurement")
        .from("purchase_orders")
        .select("order_number, order_type, site_id, sites(site_code), companies(company_code)")
        .eq("id", req.params.id)
        .single();

      // Only generate a new number if the current one is a temporary "PENDING-" ID.
      // If it's already a final number (like .../1A from an amendment), keep it.
      const isPending = curr?.order_number?.startsWith("PENDING-") || mainData.order_number?.startsWith("PENDING-");
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
            const siteCode  = curr.sites?.site_code || 'SITE';
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
      .select("*, sites(*), companies(*), vendors(*), contact_person:contacts(*)")
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
  const site = cleanOrder.sites || {};
  // Use contacts from snapshot (same as ViewOrder component)
  const finalContacts = cleanOrder.snapshot?.contacts || [];
  
  return { cleanOrder, cleanItems, comp, vend, site, contacts: finalContacts };
};

const previewHtmlCache = new Map();
const PREVIEW_CACHE_MAX = 50;

router.get("/:id/preview", async (req, res) => {
  try {
    const { cleanOrder, cleanItems, comp, vend, site, contacts } = await loadOrderForRender(req.params.id);

    const cacheKey = `${cleanOrder.id}__${cleanOrder.updated_at || cleanOrder.created_at || ""}`;
    let html = previewHtmlCache.get(cacheKey);

    if (!html) {
      const [logoDataUri, stampDataUri, signDataUri] = await Promise.all([
        fetchAsDataUri(comp.logo_url || comp.logoUrl),
        fetchAsDataUri(comp.stamp_url || comp.stampUrl),
        fetchAsDataUri(comp.sign_url || comp.signUrl),
      ]);
      const compWithImages = { ...comp, stampDataUri, signDataUri };
      html = renderOrderHtml(
        {
          order: cleanOrder,
          items: cleanItems,
          comp: compWithImages,
          vend,
          site,
          contacts,
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

const pdfCache = new Map();
const PDF_CACHE_MAX = 50;

router.get("/:id/pdf", async (req, res) => {
  try {
    const { cleanOrder, cleanItems, comp, vend, site, contacts } = await loadOrderForRender(req.params.id);
    const [logoDataUri, stampDataUri, signDataUri] = await Promise.all([
      fetchAsDataUri(comp.logo_url || comp.logoUrl),
      fetchAsDataUri(comp.stamp_url || comp.stampUrl),
      fetchAsDataUri(comp.sign_url || comp.signUrl),
    ]);
    const compWithImages = { ...comp, stampDataUri, signDataUri };
    const html = renderOrderHtml({ order: cleanOrder, items: cleanItems, comp: compWithImages, vend, site, contacts });
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
    const filename = `${cleanOrder.order_number || "order"}.pdf`.replace(/[\/\\]/g, "_");

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
      .select("status")
      .eq("id", req.params.id)
      .single();
    if (orderErr) throw orderErr;
    if (["Issued", "Rejected", "Cancelled", "Reverted", "Recalled", "Amendment Request", "Amended"].includes(order?.status)) {
      return res.status(400).json({ error: `${order.status} orders cannot be deleted` });
    }
    // Block delete if any amendment record references this order (extra safety)
    const { data: linkedAmend } = await supabase
      .from("order_amendments").select("id").eq("original_order_id", req.params.id).limit(1).maybeSingle();
    if (linkedAmend) {
      return res.status(400).json({ error: "This order has amendment history and cannot be deleted." });
    }
    await supabase.schema("procurement").from("purchase_order_items").delete().eq("order_id", req.params.id);
    const { error } = await supabase.schema("procurement").from("purchase_orders").delete().eq("id", req.params.id);
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

const POST_DOC_CATEGORIES = ["quotations", "comparative", "vendor-docs", "other", "vendor-acceptance"];

/* ─────────────────────────────────────────
   POST /api/orders/upload
   Generic file upload helper — used by amendment-request proof attachments and
   any other order-adjacent flow that just needs to store a file and get a URL.
───────────────────────────────────────── */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File is required" });
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `orders/amendments/${Date.now()}_${safeName}`;
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

module.exports = router;
