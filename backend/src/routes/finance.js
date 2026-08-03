const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, removeStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const BUCKET = "finance-docs";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

const getNextBillNumber = async () => {
  const { data } = await supabase.from("finance_bills").select("bill_number").like("bill_number", "BILL-%");
  const max = (data || []).reduce((m, r) => {
    const match = r.bill_number?.match(/^BILL-(\d+)$/);
    return match ? Math.max(m, parseInt(match[1])) : m;
  }, 0);
  return `BILL-${max + 1}`;
};

// Every bill goes through the same item grid (a "simple" bill is just one row:
// Qty 1 x Rate = Amount). GST type (same-state/other-state) is decided once
// for the whole bill; only the % differs row to row.
const computeItemTotals = (it) => {
  const qty       = Number(it.qty) || 0;
  const basicRate = Number(it.basicRate) || 0;
  const otherChg  = Number(it.otherCharges) || 0;
  const igstPct   = Number(it.igstPct) || 0;
  const cgstPct   = Number(it.cgstPct) || 0;
  const sgstPct   = Number(it.sgstPct) || 0;

  const amount      = qty * basicRate;
  const totalAmount = amount + otherChg;
  const igstAmount  = totalAmount * igstPct / 100;
  const cgstAmount  = totalAmount * cgstPct / 100;
  const sgstAmount  = totalAmount * sgstPct / 100;
  const gstAmount   = igstAmount + cgstAmount + sgstAmount;
  const netAmount   = totalAmount + gstAmount;

  return { amount, totalAmount, igstAmount, cgstAmount, sgstAmount, gstAmount, netAmount };
};

const mapItem = (r) => ({
  id:           r.id,
  billId:       r.bill_id,
  itemDate:     r.item_date,
  inNo:         r.in_no || "",
  dcNo:         r.dc_no || "",
  category:     r.category || "",
  itemType:     r.item_type || "goods",
  itemName:     r.item_name || "",
  hsnCode:      r.hsn_code || "",
  unit:         r.unit || "",
  qty:          Number(r.qty) || 0,
  basicRate:    Number(r.basic_rate) || 0,
  amount:       Number(r.amount) || 0,
  otherCharges: Number(r.other_charges) || 0,
  totalAmount:  Number(r.total_amount) || 0,
  igstPct:      Number(r.igst_pct) || 0,
  igstAmount:   Number(r.igst_amount) || 0,
  cgstPct:      Number(r.cgst_pct) || 0,
  cgstAmount:   Number(r.cgst_amount) || 0,
  sgstPct:      Number(r.sgst_pct) || 0,
  sgstAmount:   Number(r.sgst_amount) || 0,
  gstAmount:    Number(r.gst_amount) || 0,
  netAmount:    Number(r.net_amount) || 0,
  remarks:      r.remarks || "",
});

const mapPayment = async (r) => ({
  id:            r.id,
  billId:        r.bill_id,
  amount:        Number(r.amount) || 0,
  paymentDate:   r.payment_date,
  paymentMode:   r.payment_mode || "",
  referenceNo:   r.reference_no || "",
  documentUrl:   await signDoc(r.document_url),
  remarks:       r.remarks || "",
  createdByName: r.created_by_name || "",
});

const mapBill = async (r, items = [], payments = []) => {
  const amount = Number(r.amount) || 0;
  const mappedPayments = await Promise.all(payments.map(mapPayment));
  const paid   = mappedPayments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(amount - paid, 0);
  const paymentStatus = paid <= 0 ? "Unpaid" : outstanding <= 0 ? "Paid" : "Partially Paid";

  return {
    id:            r.id,
    billNumber:    r.bill_number,
    siteId:        r.site_id,
    companyId:     r.company_id,
    vendorId:      r.vendor_id,
    vendorName:    r.vendor_name || "",
    orderId:       r.order_id,
    orderNumber:   r.order_number || "",
    invoiceNumber: r.invoice_number,
    invoiceDate:   r.invoice_date,
    category:      r.category || "",
    gstType:       r.gst_type || "intra",
    amount,
    paid,
    outstanding,
    paymentStatus,
    description:   r.description || "",
    billStatus:    r.bill_status || "Pending",
    documentUrl:   await signDoc(r.document_url),
    remarks:       r.remarks || "",
    createdAt:     r.created_at,
    createdByName: r.created_by_name || "",
    updatedAt:     r.updated_at,
    items:         items.map(mapItem),
    payments:      mappedPayments,
  };
};

// Replaces all line items for a bill and returns the sum of their net amounts.
// Always called — even a single-line "simple" bill is one item row here.
const saveItems = async (billId, rawItems) => {
  await supabase.from("finance_bill_items").delete().eq("bill_id", billId);

  const items = (Array.isArray(rawItems) ? rawItems : []).filter(it => Number(it.qty) > 0 || Number(it.basicRate) > 0);
  if (!items.length) return { total: 0, rows: [] };

  const rows = items.map((it) => {
    const totals = computeItemTotals(it);
    return {
      bill_id:        billId,
      item_date:      it.itemDate || null,
      in_no:          it.inNo || "",
      dc_no:          it.dcNo || "",
      category:       it.category || "",
      item_type:      it.itemType === "service" ? "service" : "goods",
      item_name:      it.itemName || "",
      hsn_code:       it.hsnCode || "",
      unit:           it.unit || "",
      qty:            Number(it.qty) || 0,
      basic_rate:     Number(it.basicRate) || 0,
      amount:         totals.amount,
      other_charges:  Number(it.otherCharges) || 0,
      total_amount:   totals.totalAmount,
      igst_pct:       Number(it.igstPct) || 0,
      igst_amount:    totals.igstAmount,
      cgst_pct:       Number(it.cgstPct) || 0,
      cgst_amount:    totals.cgstAmount,
      sgst_pct:       Number(it.sgstPct) || 0,
      sgst_amount:    totals.sgstAmount,
      gst_amount:     totals.gstAmount,
      net_amount:     totals.netAmount,
      remarks:        it.remarks || "",
    };
  });

  const { data: inserted, error } = await supabase.from("finance_bill_items").insert(rows).select("*");
  if (error) throw error;

  const total = rows.reduce((sum, r) => sum + r.net_amount, 0);
  return { total, rows: inserted || [] };
};

// Replaces all payments recorded against a bill, uploading each row's proof
// document (matched to the request's files by the `_idx` the frontend stamps
// on every payment object, so filtering zero-amount rows first is safe).
const savePayments = async (billId, rawPayments, files) => {
  await supabase.from("finance_bill_payments").delete().eq("bill_id", billId);

  const payments = (Array.isArray(rawPayments) ? rawPayments : []).filter(p => Number(p.amount) > 0);
  if (!payments.length) return [];

  const rows = payments.map(p => ({
    bill_id:         billId,
    amount:          Number(p.amount) || 0,
    payment_date:    p.paymentDate || null,
    payment_mode:    p.paymentMode || "",
    reference_no:    p.referenceNo || "",
    remarks:         p.remarks || "",
    created_by_name: p.createdByName || "",
  }));

  const { data: inserted, error } = await supabase.from("finance_bill_payments").insert(rows).select("*");
  if (error) throw error;

  for (let i = 0; i < inserted.length; i++) {
    const origIdx = payments[i]._idx;
    const file = (files || []).find(f => f.fieldname === `paymentDoc_${origIdx}`);
    if (!file) continue;
    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const storagePath = `bills/${billId}/payments/${inserted[i].id}.${ext}`;
    await uploadStorageFile(supabase, BUCKET, storagePath, file.buffer, file.mimetype);
    await supabase.from("finance_bill_payments").update({ document_url: storagePath }).eq("id", inserted[i].id);
    inserted[i].document_url = storagePath;
  }

  return inserted;
};

const parseJsonField = (raw) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

/* GET /api/finance/bills — includes each bill's line items + payments */
router.get("/bills", async (req, res) => {
  try {
    const { siteId, vendorId, orderId, search, dateFrom, dateTo } = req.query;

    let query = supabase.from("finance_bills").select("*").is("deleted_at", null);
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
        [r.bill_number, r.vendor_name, r.order_number, r.invoice_number, r.category, r.description]
          .some(v => String(v || "").toLowerCase().includes(s))
      );
    }

    const billIds = rows.map(r => r.id);
    let itemsByBill = {};
    let paymentsByBill = {};
    if (billIds.length) {
      const [{ data: itemRows }, { data: paymentRows }] = await Promise.all([
        supabase.from("finance_bill_items").select("*").in("bill_id", billIds),
        supabase.from("finance_bill_payments").select("*").in("bill_id", billIds),
      ]);
      itemsByBill = (itemRows || []).reduce((acc, it) => { (acc[it.bill_id] ||= []).push(it); return acc; }, {});
      paymentsByBill = (paymentRows || []).reduce((acc, p) => { (acc[p.bill_id] ||= []).push(p); return acc; }, {});
    }

    const bills = await Promise.all(rows.map(r => mapBill(r, itemsByBill[r.id] || [], paymentsByBill[r.id] || [])));
    res.json({ bills });
  } catch (err) {
    console.error("Finance bills read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/finance/bills */
router.post("/bills", requirePerm("payments_track", "can_add"), upload.any(), async (req, res) => {
  try {
    const {
      siteId, companyId, vendorId, vendorName, orderId, orderNumber,
      invoiceNumber, invoiceDate, category, description, remarks, billStatus, gstType,
    } = req.body;

    if (!invoiceNumber || !String(invoiceNumber).trim()) {
      return res.status(400).json({ error: "Invoice number is required" });
    }

    const billNumber = await getNextBillNumber();
    const { data: created, error: insertError } = await supabase
      .from("finance_bills")
      .insert({
        bill_number:    billNumber,
        site_id:        siteId || null,
        company_id:     companyId || null,
        vendor_id:      vendorId || null,
        vendor_name:    vendorName || "",
        order_id:       orderId || null,
        order_number:   orderNumber || "",
        invoice_number: invoiceNumber,
        invoice_date:   invoiceDate || null,
        category:       category || "",
        gst_type:       gstType === "inter" ? "inter" : "intra",
        description:    description || "",
        remarks:        remarks || "",
        bill_status:    billStatus || "Pending",
        created_by_id:   req._authUserId || null,
        created_by_name: req.body.createdByName || "",
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const billDoc = (req.files || []).find(f => f.fieldname === "document");
    let documentPath = null;
    if (billDoc) {
      const ext = (billDoc.originalname.split(".").pop() || "pdf").toLowerCase();
      documentPath = `bills/${created.id}.${ext}`;
      await uploadStorageFile(supabase, BUCKET, documentPath, billDoc.buffer, billDoc.mimetype);
    }

    const { total: itemsTotal, rows: itemRows } = await saveItems(created.id, parseJsonField(req.body.items));
    const paymentRows = await savePayments(created.id, parseJsonField(req.body.payments), req.files);

    const { data: finalRow } = await supabase
      .from("finance_bills")
      .update({ amount: itemsTotal, document_url: documentPath })
      .eq("id", created.id)
      .select("*")
      .single();

    res.json({ bill: await mapBill(finalRow, itemRows, paymentRows) });
  } catch (err) {
    console.error("Finance bill create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/finance/bills/:id */
router.put("/bills/:id", requirePerm("payments_track", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      siteId, companyId, vendorId, vendorName, orderId, orderNumber,
      invoiceNumber, invoiceDate, category, description, remarks, billStatus, gstType,
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
      gst_type:       gstType === "inter" ? "inter" : "intra",
      description:    description || "",
      remarks:        remarks || "",
      bill_status:    billStatus || "Pending",
      updated_at:     new Date().toISOString(),
    };

    const billDoc = (req.files || []).find(f => f.fieldname === "document");
    if (billDoc) {
      const ext = (billDoc.originalname.split(".").pop() || "pdf").toLowerCase();
      const storagePath = `bills/${id}.${ext}`;
      await uploadStorageFile(supabase, BUCKET, storagePath, billDoc.buffer, billDoc.mimetype);
      updates.document_url = storagePath;
    }

    const { total: itemsTotal, rows: itemRows } = await saveItems(id, parseJsonField(req.body.items));
    const paymentRows = await savePayments(id, parseJsonField(req.body.payments), req.files);
    updates.amount = itemsTotal;

    const { data: updated, error } = await supabase
      .from("finance_bills").update(updates).eq("id", id).select("*").single();
    if (error) throw error;

    res.json({ bill: await mapBill(updated, itemRows, paymentRows) });
  } catch (err) {
    console.error("Finance bill update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/finance/bills/:id — soft delete, matches vendors' trash pattern */
router.delete("/bills/:id", requirePerm("payments_track", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("finance_bills")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Finance bill delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
