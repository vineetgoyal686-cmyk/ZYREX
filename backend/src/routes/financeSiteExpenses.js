// Site Expenses — kept as its own file with its own tables, fully separate
// from finance.js (Payments Track), per instructions not to touch Payments
// Track while this is built. Charges/GST live in an Order-style summary
// (Subtotal → Discount → Charges → GST → Grand Total) instead of per item row.
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const BUCKET = "finance-docs";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

const getNextExpenseNumber = async () => {
  const { data } = await supabase.from("finance_site_expenses").select("expense_number").like("expense_number", "EXP-%");
  const max = (data || []).reduce((m, r) => {
    const match = r.expense_number?.match(/^EXP-(\d+)$/);
    return match ? Math.max(m, parseInt(match[1])) : m;
  }, 0);
  return `EXP-${max + 1}`;
};

// Items are now just Qty x Rate — no per-line charges or GST (those moved
// into the header-level summary below).
const computeItemAmount = (it) => (Number(it.qty) || 0) * (Number(it.basicRate) || 0);

const CHARGE_KEYS = ["labour", "freight", "transport", "installation"];

// Mirrors Create Order's totals logic, generalized from one Freight field to
// four named charges: Subtotal -> Discount -> (charges in/out of taxable base
// depending on chargesBeforeGst) -> GST -> Grand Total.
const computeSummary = (subtotal, b) => {
  const discountMode = b.discountMode === "total" ? "total" : "none";
  const discountPct  = discountMode === "total" ? (Number(b.discountPct) || 0) : 0;
  const discountAmount = subtotal * discountPct / 100;
  const afterDiscount  = subtotal - discountAmount;

  const charges = {};
  let chargesTotal = 0;
  for (const key of CHARGE_KEYS) {
    const enabled = String(b[`${key}Enabled`]) === "true";
    const amount  = enabled ? (Number(b[`${key}Charge`]) || 0) : 0;
    charges[key] = { enabled, amount };
    chargesTotal += amount;
  }

  const chargesBeforeGst = String(b.chargesBeforeGst) !== "false"; // default true
  const taxableAmount = chargesBeforeGst ? afterDiscount + chargesTotal : afterDiscount;

  const gstMode = b.gstMode === "total" ? "total" : "none";
  const gstPct  = gstMode === "total" ? (Number(b.gstPct) || 0) : 0;
  const gstAmount = taxableAmount * gstPct / 100;

  const grandTotal = chargesBeforeGst
    ? afterDiscount + chargesTotal + gstAmount
    : afterDiscount + gstAmount + chargesTotal;

  return { discountMode, discountPct, discountAmount, charges, chargesTotal, chargesBeforeGst, gstMode, gstPct, gstAmount, taxableAmount, grandTotal };
};

const mapItem = (r) => ({
  id:        r.id,
  expenseId: r.expense_id,
  inNo:      r.in_no || "",
  itemName:  r.item_name || "",
  unit:      r.unit || "",
  qty:       Number(r.qty) || 0,
  basicRate: Number(r.basic_rate) || 0,
  amount:    Number(r.amount) || 0,
  remarks:   r.remarks || "",
});

const mapPayment = async (r) => ({
  id:            r.id,
  expenseId:     r.expense_id,
  amount:        Number(r.amount) || 0,
  paymentDate:   r.payment_date,
  paymentMode:   r.payment_mode || "",
  referenceNo:   r.reference_no || "",
  documentUrl:   await signDoc(r.document_url),
  remarks:       r.remarks || "",
  createdByName: r.created_by_name || "",
});

const mapExpense = async (r, items = [], payments = []) => {
  const amount = Number(r.amount) || 0;
  const mappedPayments = await Promise.all(payments.map(mapPayment));
  const paid   = mappedPayments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(amount - paid, 0);
  const paymentStatus = paid <= 0 ? "Unpaid" : outstanding <= 0 ? "Paid" : "Partially Paid";

  return {
    id:             r.id,
    expenseNumber:  r.expense_number,
    siteId:         r.site_id,
    companyId:      r.company_id,
    vendorId:       r.vendor_id,
    vendorName:     r.vendor_name || "",
    orderId:        r.order_id,
    orderNumber:    r.order_number || "",
    invoiceNumber:  r.invoice_number,
    invoiceDate:    r.invoice_date,
    category:       r.category || "",
    subtotal:       Number(r.subtotal) || 0,
    discountMode:   r.discount_mode || "none",
    discountPct:    Number(r.discount_pct) || 0,
    discountAmount: Number(r.discount_amount) || 0,
    labourEnabled:      !!r.labour_charge_enabled,
    labourCharge:       Number(r.labour_charge) || 0,
    freightEnabled:     !!r.freight_charge_enabled,
    freightCharge:      Number(r.freight_charge) || 0,
    transportEnabled:   !!r.transport_charge_enabled,
    transportCharge:    Number(r.transport_charge) || 0,
    installationEnabled: !!r.installation_charge_enabled,
    installationCharge:  Number(r.installation_charge) || 0,
    chargesBeforeGst: r.charges_before_gst !== false,
    gstType:        r.gst_type || "intra",
    gstMode:        r.gst_mode || "none",
    gstPct:         Number(r.gst_pct) || 0,
    gstAmount:      Number(r.gst_amount) || 0,
    taxableAmount:  Number(r.taxable_amount) || 0,
    amount,
    paid,
    outstanding,
    paymentStatus,
    description:    r.description || "",
    billStatus:     r.bill_status || "Pending",
    documentUrls:   await Promise.all((r.document_urls || []).map(signDoc)),
    ewayBillUrls:   await Promise.all((r.eway_bill_urls || []).map(signDoc)),
    otherDocUrls:   await Promise.all((r.other_doc_urls || []).map(signDoc)),
    remarks:        r.remarks || "",
    createdAt:      r.created_at,
    createdByName:  r.created_by_name || "",
    updatedAt:      r.updated_at,
    items:          items.map(mapItem),
    payments:       mappedPayments,
  };
};

const saveItems = async (expenseId, rawItems) => {
  await supabase.from("finance_site_expense_items").delete().eq("expense_id", expenseId);

  const items = (Array.isArray(rawItems) ? rawItems : []).filter(it => Number(it.qty) > 0 || Number(it.basicRate) > 0);
  if (!items.length) return { subtotal: 0, rows: [] };

  const rows = items.map((it) => ({
    expense_id: expenseId,
    in_no:      it.inNo || "",
    item_name:  it.itemName || "",
    unit:       it.unit || "",
    qty:        Number(it.qty) || 0,
    basic_rate: Number(it.basicRate) || 0,
    amount:     computeItemAmount(it),
    remarks:    it.remarks || "",
  }));

  const { data: inserted, error } = await supabase.from("finance_site_expense_items").insert(rows).select("*");
  if (error) throw error;

  const subtotal = rows.reduce((sum, r) => sum + r.amount, 0);
  return { subtotal, rows: inserted || [] };
};

const savePayments = async (expenseId, rawPayments, files) => {
  await supabase.from("finance_site_expense_payments").delete().eq("expense_id", expenseId);

  const payments = (Array.isArray(rawPayments) ? rawPayments : []).filter(p => Number(p.amount) > 0);
  if (!payments.length) return [];

  const rows = payments.map(p => ({
    expense_id:      expenseId,
    amount:          Number(p.amount) || 0,
    payment_date:    p.paymentDate || null,
    payment_mode:    p.paymentMode || "",
    reference_no:    p.referenceNo || "",
    remarks:         p.remarks || "",
    created_by_name: p.createdByName || "",
  }));

  const { data: inserted, error } = await supabase.from("finance_site_expense_payments").insert(rows).select("*");
  if (error) throw error;

  for (let i = 0; i < inserted.length; i++) {
    const origIdx = payments[i]._idx;
    const file = (files || []).find(f => f.fieldname === `paymentDoc_${origIdx}`);
    if (!file) continue;
    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const storagePath = `site-expenses/${expenseId}/payments/${inserted[i].id}.${ext}`;
    await uploadStorageFile(supabase, BUCKET, storagePath, file.buffer, file.mimetype);
    await supabase.from("finance_site_expense_payments").update({ document_url: storagePath }).eq("id", inserted[i].id);
    inserted[i].document_url = storagePath;
  }

  return inserted;
};

const parseJsonField = (raw) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

// Uploads every file submitted under `fieldname` (a doc box can attach more
// than one) and returns their storage paths — each gets its own unique path
// so multiple files never collide.
const uploadNamedDocs = async (files, fieldname, pathPrefix) => {
  const matches = (files || []).filter(f => f.fieldname === fieldname);
  const paths = [];
  for (let i = 0; i < matches.length; i++) {
    const file = matches[i];
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${pathPrefix}/${Date.now()}_${i}_${safeName}`;
    await uploadStorageFile(supabase, BUCKET, path, file.buffer, file.mimetype);
    paths.push(path);
  }
  return paths;
};

// Builds the DB update payload for all summary/charges/GST columns, shared
// by both create and update.
const buildSummaryUpdate = (subtotal, body) => {
  const s = computeSummary(subtotal, body);
  return {
    subtotal,
    discount_mode:   s.discountMode,
    discount_pct:    s.discountPct,
    discount_amount: s.discountAmount,
    labour_charge_enabled:       s.charges.labour.enabled,
    labour_charge:               s.charges.labour.amount,
    freight_charge_enabled:      s.charges.freight.enabled,
    freight_charge:              s.charges.freight.amount,
    transport_charge_enabled:    s.charges.transport.enabled,
    transport_charge:            s.charges.transport.amount,
    installation_charge_enabled: s.charges.installation.enabled,
    installation_charge:         s.charges.installation.amount,
    charges_before_gst: s.chargesBeforeGst,
    gst_type:  body.gstType === "inter" ? "inter" : "intra",
    gst_mode:  s.gstMode,
    gst_pct:   s.gstPct,
    gst_amount: s.gstAmount,
    taxable_amount: s.taxableAmount,
    amount: s.grandTotal,
  };
};

/* GET /api/finance/site-expenses */
router.get("/site-expenses", async (req, res) => {
  try {
    const { siteId, vendorId, orderId, search, dateFrom, dateTo } = req.query;

    let query = supabase.from("finance_site_expenses").select("*").is("deleted_at", null);
    if (siteId)   query = query.eq("site_id", siteId);
    if (vendorId) query = query.eq("vendor_id", vendorId);
    if (orderId)  query = query.eq("order_id", orderId);
    if (dateFrom) query = query.gte("invoice_date", dateFrom);
    if (dateTo)   query = query.lte("invoice_date", dateTo);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    let rows = data || [];
    if (search) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r =>
        [r.expense_number, r.vendor_name, r.order_number, r.invoice_number, r.category, r.description]
          .some(v => String(v || "").toLowerCase().includes(s))
      );
    }

    const expenseIds = rows.map(r => r.id);
    let itemsByExpense = {};
    let paymentsByExpense = {};
    if (expenseIds.length) {
      const [{ data: itemRows }, { data: paymentRows }] = await Promise.all([
        supabase.from("finance_site_expense_items").select("*").in("expense_id", expenseIds),
        supabase.from("finance_site_expense_payments").select("*").in("expense_id", expenseIds),
      ]);
      itemsByExpense = (itemRows || []).reduce((acc, it) => { (acc[it.expense_id] ||= []).push(it); return acc; }, {});
      paymentsByExpense = (paymentRows || []).reduce((acc, p) => { (acc[p.expense_id] ||= []).push(p); return acc; }, {});
    }

    const expenses = await Promise.all(rows.map(r => mapExpense(r, itemsByExpense[r.id] || [], paymentsByExpense[r.id] || [])));
    res.json({ expenses });
  } catch (err) {
    console.error("Site expenses read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/finance/site-expenses */
router.post("/site-expenses", requirePerm("site_expense", "can_add"), upload.any(), async (req, res) => {
  try {
    const {
      siteId, companyId, vendorId, vendorName, orderId, orderNumber,
      invoiceNumber, invoiceDate, category, description, remarks, billStatus,
    } = req.body;

    if (!invoiceNumber || !String(invoiceNumber).trim()) {
      return res.status(400).json({ error: "Invoice number is required" });
    }

    const expenseNumber = await getNextExpenseNumber();
    const { data: created, error: insertError } = await supabase
      .from("finance_site_expenses")
      .insert({
        expense_number: expenseNumber,
        site_id:        siteId || null,
        company_id:     companyId || null,
        vendor_id:      vendorId || null,
        vendor_name:    vendorName || "",
        order_id:       orderId || null,
        order_number:   orderNumber || "",
        invoice_number: invoiceNumber,
        invoice_date:   invoiceDate || null,
        category:       category || "",
        description:    description || "",
        remarks:        remarks || "",
        bill_status:    billStatus || "Pending",
        created_by_id:   req._authUserId || null,
        created_by_name: req.body.createdByName || "",
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const documentUrls = await uploadNamedDocs(req.files, "document",    `site-expenses/${created.id}/invoice`);
    const ewayBillUrls = await uploadNamedDocs(req.files, "ewayBillDoc", `site-expenses/${created.id}/eway-bill`);
    const otherDocUrls = await uploadNamedDocs(req.files, "otherDoc",    `site-expenses/${created.id}/other`);

    const { subtotal, rows: itemRows } = await saveItems(created.id, parseJsonField(req.body.items));
    const paymentRows = await savePayments(created.id, parseJsonField(req.body.payments), req.files);

    const { data: finalRow } = await supabase
      .from("finance_site_expenses")
      .update({
        ...buildSummaryUpdate(subtotal, req.body),
        document_urls: documentUrls,
        eway_bill_urls: ewayBillUrls,
        other_doc_urls: otherDocUrls,
      })
      .eq("id", created.id)
      .select("*")
      .single();

    res.json({ expense: await mapExpense(finalRow, itemRows, paymentRows) });
  } catch (err) {
    console.error("Site expense create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/finance/site-expenses/:id */
router.put("/site-expenses/:id", requirePerm("site_expense", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      siteId, companyId, vendorId, vendorName, orderId, orderNumber,
      invoiceNumber, invoiceDate, category, description, remarks, billStatus,
    } = req.body;

    const updates = {
      site_id:        siteId || null,
      company_id:     companyId || null,
      vendor_id:      vendorId || null,
      vendor_name:    vendorName || "",
      order_id:       orderId || null,
      order_number:   orderNumber || "",
      invoice_number: invoiceNumber,
      invoice_date:   invoiceDate || null,
      category:       category || "",
      description:    description || "",
      remarks:        remarks || "",
      bill_status:    billStatus || "Pending",
      updated_at:     new Date().toISOString(),
    };

    const keepDocuments = parseJsonField(req.body.documentKeep);
    const keepEwayBills = parseJsonField(req.body.ewayBillKeep);
    const keepOtherDocs = parseJsonField(req.body.otherDocKeep);
    const newDocuments  = await uploadNamedDocs(req.files, "document",    `site-expenses/${id}/invoice`);
    const newEwayBills  = await uploadNamedDocs(req.files, "ewayBillDoc", `site-expenses/${id}/eway-bill`);
    const newOtherDocs  = await uploadNamedDocs(req.files, "otherDoc",    `site-expenses/${id}/other`);
    updates.document_urls  = [...keepDocuments, ...newDocuments];
    updates.eway_bill_urls = [...keepEwayBills, ...newEwayBills];
    updates.other_doc_urls = [...keepOtherDocs, ...newOtherDocs];

    const { subtotal, rows: itemRows } = await saveItems(id, parseJsonField(req.body.items));
    const paymentRows = await savePayments(id, parseJsonField(req.body.payments), req.files);
    Object.assign(updates, buildSummaryUpdate(subtotal, req.body));

    const { data: updated, error } = await supabase
      .from("finance_site_expenses").update(updates).eq("id", id).select("*").single();
    if (error) throw error;

    res.json({ expense: await mapExpense(updated, itemRows, paymentRows) });
  } catch (err) {
    console.error("Site expense update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/finance/site-expenses/:id — soft delete */
router.delete("/site-expenses/:id", requirePerm("site_expense", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("finance_site_expenses")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Site expense delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
