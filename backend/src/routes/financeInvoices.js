// Payments Track — Invoices: each invoice belongs to a finance_orders row
// (vendor/order info entered once, reused across every invoice raised
// against it), with its own repeatable payments and its own attachments.
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const BUCKET = "finance-docs";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

const BILL_STATUSES = ["Pending", "Approved", "Rejected", "Hold"];
const PAYMENT_MODES = ["Cash", "Cheque", "NEFT", "RTGS", "UPI"];

const mapPayment = (r) => ({
  id:            r.id,
  invoiceId:     r.invoice_id,
  paidAmount:    Number(r.paid_amount) || 0,
  paidDate:      r.paid_date,
  mode:          r.mode || "",
  referenceNo:   r.reference_no || "",
  remarks:       r.remarks || "",
  createdByName: r.created_by_name || "",
  createdAt:     r.created_at,
});

// `order` is the joined finance_orders row (vendor/order info lives there now).
const mapInvoice = async (r, order, payments = []) => {
  const totalPayable = Number(r.invoice_amount) || 0;
  const mappedPayments = payments.map(mapPayment);
  const totalPaid = mappedPayments.reduce((sum, p) => sum + p.paidAmount, 0);
  const balance = Math.max(totalPayable - totalPaid, 0);
  const paymentStatus = totalPaid <= 0 ? "Unpaid" : balance <= 0 ? "Fully Paid" : "Partially Paid";

  return {
    id:               r.id,
    orderId:          r.order_id,
    siteId:           r.site_id,
    vendorId:         order?.vendor_id || null,
    vendorName:       order?.vendor_name || "",
    msmeNumber:       order?.msme_number || "",
    companyId:        order?.company_id || null,
    companyName:      order?.company_name || "",
    orderNo:          order?.order_no || "",
    orderDate:        order?.order_date || null,
    orderValue:       Number(order?.order_value) || 0,
    invoiceNo:        r.invoice_no,
    invoiceDate:      r.invoice_date,
    invoiceAmount:    totalPayable,
    expenseCategory:  r.expense_category || "",
    expenseInfo:      r.expense_info || "",
    tallyStatus:      r.tally_status || "No",
    billStatus:       r.bill_status || "Pending",
    totalPayable,
    totalPaid,
    balance,
    paymentStatus,
    documentUrls:     await Promise.all((r.document_urls || []).map(signDoc)),
    createdAt:        r.created_at,
    createdByName:    r.created_by_name || "",
    updatedAt:        r.updated_at,
    payments:         mappedPayments,
  };
};

const num = (v) => Math.max(Number(v) || 0, 0); // negative numbers are never valid here

const savePayments = async (invoiceId, rawPayments) => {
  await supabase.from("finance_invoice_payments").delete().eq("invoice_id", invoiceId);

  const payments = (Array.isArray(rawPayments) ? rawPayments : []).filter(p => Number(p.paidAmount) > 0);
  if (!payments.length) return [];

  const rows = payments.map(p => ({
    invoice_id:      invoiceId,
    paid_amount:     num(p.paidAmount),
    paid_date:       p.paidDate || null,
    mode:            PAYMENT_MODES.includes(p.mode) ? p.mode : "",
    reference_no:    p.referenceNo || "",
    remarks:         p.remarks || "",
    created_by_name: p.createdByName || "",
  }));

  const { data: inserted, error } = await supabase.from("finance_invoice_payments").insert(rows).select("*");
  if (error) throw error;
  return inserted || [];
};

// Uploads every file submitted under `fieldname` and returns their storage paths.
const uploadDocs = async (files, fieldname, pathPrefix) => {
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

const parseJsonField = (raw) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

/* GET /api/finance/invoices */
router.get("/invoices", async (req, res) => {
  try {
    const { siteId, orderId, billStatus, expenseCategory, search, dateFrom, dateTo } = req.query;

    let query = supabase.from("finance_invoices").select("*").is("deleted_at", null);
    if (siteId)          query = query.eq("site_id", siteId);
    if (orderId)         query = query.eq("order_id", orderId);
    if (billStatus)      query = query.eq("bill_status", billStatus);
    if (expenseCategory) query = query.eq("expense_category", expenseCategory);
    if (dateFrom)         query = query.gte("invoice_date", dateFrom);
    if (dateTo)           query = query.lte("invoice_date", dateTo);

    const { data, error } = await query.order("invoice_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;

    let rows = data || [];

    const orderIds = [...new Set(rows.map(r => r.order_id).filter(Boolean))];
    let ordersById = {};
    if (orderIds.length) {
      const { data: orderRows } = await supabase.from("finance_orders").select("*").in("id", orderIds);
      ordersById = (orderRows || []).reduce((acc, o) => { acc[o.id] = o; return acc; }, {});
    }

    if (search) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r => {
        const order = ordersById[r.order_id];
        return [order?.vendor_name, order?.order_no, r.invoice_no, r.expense_category]
          .some(v => String(v || "").toLowerCase().includes(s));
      });
    }

    const invoiceIds = rows.map(r => r.id);
    let paymentsByInvoice = {};
    if (invoiceIds.length) {
      const { data: paymentRows } = await supabase.from("finance_invoice_payments").select("*").in("invoice_id", invoiceIds);
      paymentsByInvoice = (paymentRows || []).reduce((acc, p) => { (acc[p.invoice_id] ||= []).push(p); return acc; }, {});
    }

    let invoices = await Promise.all(rows.map(r => mapInvoice(r, ordersById[r.order_id], paymentsByInvoice[r.id] || [])));

    // paymentStatus is derived, not a column — filter it in JS.
    if (req.query.paymentStatus) invoices = invoices.filter(i => i.paymentStatus === req.query.paymentStatus);

    res.json({ invoices });
  } catch (err) {
    console.error("Finance invoices read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/finance/invoices */
router.post("/invoices", requirePerm("payments_track", "can_add"), upload.any(), async (req, res) => {
  try {
    const {
      orderId, siteId, invoiceNo, invoiceDate, invoiceAmount,
      expenseCategory, expenseInfo, tallyStatus, billStatus, payments,
    } = req.body;

    if (!orderId) return res.status(400).json({ error: "Order is required" });
    if (!invoiceNo || !String(invoiceNo).trim()) return res.status(400).json({ error: "Invoice number is required" });
    if (!invoiceDate) return res.status(400).json({ error: "Invoice date is required" });

    const { data: order } = await supabase.from("finance_orders").select("*").eq("id", orderId).single();
    if (!order) return res.status(400).json({ error: "Selected order was not found" });

    const { data: created, error: insertError } = await supabase
      .from("finance_invoices")
      .insert({
        order_id:          orderId,
        site_id:           siteId || order.site_id || null,
        invoice_no:        invoiceNo,
        invoice_date:      invoiceDate,
        invoice_amount:    num(invoiceAmount),
        expense_category:  expenseCategory || "",
        expense_info:      expenseInfo || "",
        tally_status:      tallyStatus === "Yes" ? "Yes" : "No",
        bill_status:        BILL_STATUSES.includes(billStatus) ? billStatus : "Pending",
        created_by_id:      req._authUserId || null,
        created_by_name:    req.body.createdByName || "",
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const documentUrls = await uploadDocs(req.files, "document", `finance-invoices/${created.id}`);
    const { data: finalRow } = await supabase
      .from("finance_invoices").update({ document_urls: documentUrls }).eq("id", created.id).select("*").single();

    const paymentRows = await savePayments(created.id, parseJsonField(req.body.payments));
    res.json({ invoice: await mapInvoice(finalRow, order, paymentRows) });
  } catch (err) {
    console.error("Finance invoice create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/finance/invoices/:id */
router.put("/invoices/:id", requirePerm("payments_track", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      orderId, invoiceNo, invoiceDate, invoiceAmount,
      expenseCategory, expenseInfo, tallyStatus, billStatus,
    } = req.body;

    if (!orderId) return res.status(400).json({ error: "Order is required" });
    if (!invoiceNo || !String(invoiceNo).trim()) return res.status(400).json({ error: "Invoice number is required" });
    if (!invoiceDate) return res.status(400).json({ error: "Invoice date is required" });

    const { data: order } = await supabase.from("finance_orders").select("*").eq("id", orderId).single();
    if (!order) return res.status(400).json({ error: "Selected order was not found" });

    const keepDocs = parseJsonField(req.body.documentKeep);
    const newDocs  = await uploadDocs(req.files, "document", `finance-invoices/${id}`);

    const { data: updated, error } = await supabase
      .from("finance_invoices")
      .update({
        order_id:          orderId,
        site_id:           order.site_id || null,
        invoice_no:        invoiceNo,
        invoice_date:      invoiceDate,
        invoice_amount:    num(invoiceAmount),
        expense_category:  expenseCategory || "",
        expense_info:      expenseInfo || "",
        tally_status:      tallyStatus === "Yes" ? "Yes" : "No",
        bill_status:        BILL_STATUSES.includes(billStatus) ? billStatus : "Pending",
        document_urls:      [...keepDocs, ...newDocs],
        updated_at:         new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    const paymentRows = await savePayments(id, parseJsonField(req.body.payments));
    res.json({ invoice: await mapInvoice(updated, order, paymentRows) });
  } catch (err) {
    console.error("Finance invoice update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/finance/invoices/:id — soft delete */
router.delete("/invoices/:id", requirePerm("payments_track", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("finance_invoices")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Finance invoice delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const norm = (v) => String(v || "").trim().toLowerCase();
const excelDateToISO = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30).
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const parsed = new Date(v);
  return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
};

/* POST /api/finance/invoices/bulk — one row per invoice; vendor/order info is
   matched to an existing finance_orders row (by vendor + order no) or a new
   one is created, so repeat rows for the same order don't duplicate it. */
router.post("/invoices/bulk", requirePerm("payments_track", "can_bulk_upload"), async (req, res) => {
  try {
    const { rows, siteId, createdByName } = req.body;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "No rows to upload" });

    const [{ data: vendors }, { data: companies }] = await Promise.all([
      supabase.schema("procurement").from("vendors").select("id, vendor_name, msme_number").is("deleted_at", null),
      supabase.schema("organisation").from("companies").select("id, company_name"),
    ]);
    const vendorByName  = new Map((vendors || []).map(v => [norm(v.vendor_name), v]));
    const companyByName = new Map((companies || []).map(c => [norm(c.company_name), c]));

    // Cache orders already matched/created in this batch so repeat rows for
    // the same vendor + order no share one order instead of duplicating it.
    const orderCache = new Map(); // `${vendorId}::${orderNo}` -> orderId
    const details = [];
    let inserted = 0;

    for (const row of rows) {
      const vendorName = String(row["Vendor Name"] || "").trim();
      const invoiceNo   = String(row["Invoice No"] || "").trim();
      const invoiceDate = excelDateToISO(row["Invoice Date"]);
      const invoiceAmount = Number(row["Invoice Amount"]) || 0;

      if (!vendorName) { details.push({ row: invoiceNo || "(blank)", status: "skipped", reason: "Vendor Name is required" }); continue; }
      const vendor = vendorByName.get(norm(vendorName));
      if (!vendor) { details.push({ row: invoiceNo || vendorName, status: "skipped", reason: `Vendor "${vendorName}" not found` }); continue; }
      if (!invoiceNo) { details.push({ row: vendorName, status: "skipped", reason: "Invoice No is required" }); continue; }
      if (!invoiceDate) { details.push({ row: invoiceNo, status: "skipped", reason: "Invoice Date is missing or invalid" }); continue; }
      if (invoiceAmount <= 0) { details.push({ row: invoiceNo, status: "skipped", reason: "Invoice Amount must be greater than 0" }); continue; }

      const orderNo = String(row["Order No"] || "").trim();
      const cacheKey = `${vendor.id}::${norm(orderNo)}`;
      let orderId = orderCache.get(cacheKey);

      if (!orderId && orderNo) {
        const { data: existingOrder } = await supabase
          .from("finance_orders").select("id")
          .eq("site_id", siteId || null).eq("vendor_id", vendor.id).eq("order_no", orderNo)
          .is("deleted_at", null).maybeSingle();
        if (existingOrder) orderId = existingOrder.id;
      }

      if (!orderId) {
        const companyName = String(row["Company Name"] || "").trim();
        const company = companyName ? companyByName.get(norm(companyName)) : null;
        const { data: newOrder, error: orderErr } = await supabase
          .from("finance_orders")
          .insert({
            site_id:         siteId || null,
            vendor_id:       vendor.id,
            vendor_name:     vendor.vendor_name || vendorName,
            msme_number:     vendor.msme_number || "",
            company_id:      company?.id || null,
            company_name:    company?.company_name || companyName,
            order_no:        orderNo,
            order_date:      excelDateToISO(row["Order Date"]),
            order_value:     Math.max(Number(row["Order Value"]) || 0, 0),
            created_by_id:   req._authUserId || null,
            created_by_name: createdByName || "Bulk Upload",
          })
          .select("id").single();
        if (orderErr) { details.push({ row: invoiceNo, status: "skipped", reason: "Could not create order" }); continue; }
        orderId = newOrder.id;
      }
      orderCache.set(cacheKey, orderId);

      const { error: invErr } = await supabase.from("finance_invoices").insert({
        order_id:          orderId,
        site_id:           siteId || null,
        invoice_no:        invoiceNo,
        invoice_date:      invoiceDate,
        invoice_amount:    invoiceAmount,
        expense_category:  String(row["Expense Category"] || "").trim(),
        expense_info:      String(row["Expense Info"] || "").trim(),
        tally_status:      norm(row["Tally Status"]) === "yes" ? "Yes" : "No",
        bill_status:       BILL_STATUSES.includes(row["Bill Status"]) ? row["Bill Status"] : "Pending",
        created_by_id:      req._authUserId || null,
        created_by_name:    createdByName || "Bulk Upload",
      });
      if (invErr) { details.push({ row: invoiceNo, status: "skipped", reason: "Could not save invoice" }); continue; }

      inserted++;
      details.push({ row: invoiceNo, status: "inserted", reason: `${vendorName} · ${fmtINRPlain(invoiceAmount)}` });
    }

    res.json({ success: true, inserted, skipped: rows.length - inserted, details });
  } catch (err) {
    console.error("Finance invoices bulk upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function fmtINRPlain(v) { return `₹${(Number(v) || 0).toLocaleString("en-IN")}`; }

module.exports = router;
