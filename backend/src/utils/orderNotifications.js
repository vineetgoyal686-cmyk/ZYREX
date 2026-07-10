const admin = require("../helpers/supabaseHelper");
const { sendTemplateEmail } = require("./mailer");

const escapeHtml = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Every controllable notification event. `defaultEnabled` is used only when
// no row exists yet in mail_notification_config for that event — i.e. the
// state before an admin has ever touched it in the Mail Management screen.
// The original submit/withdraw events (already relied upon) stay on by
// default; the newer outcome events start off so nothing changes for
// existing users until they opt in.
// fixedTo describes who always gets this email regardless of Mail Management
// config — either a named Request Handler lookup, or a plain description when
// the recipient varies per-order (the original requester, whichever approver
// level is currently pending) and can't be resolved to a fixed name here.
// statusLine is the sentence that fills in "...{order} <statusLine>" in the
// email body — kept per-event since "submitted, awaiting approval" reads wrong
// for an outcome email like Approved/Rejected/Direct.
const EVENTS = {
  amend_request:      { label: "Amend Request",            defaultEnabled: true,  fixedTo: { type: "handler", key: "amend" }, statusLine: "has been submitted and is awaiting your approval.", actorLabel: "Requested By", ctaLabel: "Review Request" },
  amend_withdraw:     { label: "Amend Request Withdrawn",   defaultEnabled: true,  fixedTo: { type: "handler", key: "amend" }, statusLine: "has been withdrawn by the requester.", noReason: true },
  amend_approved:     { label: "Amend Request Approved",    defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been approved.", noReason: true },
  amend_rejected:     { label: "Amend Request Rejected",    defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been rejected.", actorLabel: "Rejected By" },
  amend_direct:       { label: "Direct Amendment",          defaultEnabled: false, fixedTo: { type: "text", label: "Order Creator" }, statusLine: "has been amended directly by a handler — no approval step was required.", isDirect: true, actorLabel: "Done By" },

  cancel_request:     { label: "Cancel Request",            defaultEnabled: true,  fixedTo: { type: "handler", key: "cancel" }, statusLine: "has been submitted and is awaiting your approval.", actorLabel: "Requested By", ctaLabel: "Review Request" },
  cancel_withdraw:    { label: "Cancel Request Withdrawn",   defaultEnabled: true,  fixedTo: { type: "handler", key: "cancel" }, statusLine: "has been withdrawn by the requester.", noReason: true },
  cancel_approved:    { label: "Cancel Request Approved",    defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been approved.", noReason: true },
  cancel_rejected:    { label: "Cancel Request Rejected",    defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been rejected.", actorLabel: "Rejected By" },

  recall_request:      { label: "Recall Request",            defaultEnabled: true,  fixedTo: { type: "handler", key: "recall" }, statusLine: "has been submitted and is awaiting your approval.", actorLabel: "Requested By", ctaLabel: "Review Request" },
  recall_withdraw:     { label: "Recall Request Withdrawn",  defaultEnabled: true,  fixedTo: { type: "handler", key: "recall" }, statusLine: "has been withdrawn by the requester.", noReason: true },
  recall_approved:     { label: "Recall Request Approved",   defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been approved.", noReason: true },
  recall_rejected:     { label: "Recall Request Rejected",   defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been rejected.", actorLabel: "Rejected By" },

  approval_request:   { label: "Approval Request",          defaultEnabled: true,  fixedTo: { type: "text", label: "Level 1 Approver(s)" }, statusLine: "has been submitted and is awaiting your approval.", noReason: true, actorLabel: "Requested By", ctaLabel: "Review & Approve" },
  approval_withdraw:  { label: "Approval Request Withdrawn", defaultEnabled: true,  fixedTo: { type: "text", label: "Current Level Approver(s)" }, statusLine: "has been withdrawn by the requester.", noReason: true },
  approval_approved:  { label: "Approval Request Approved",  defaultEnabled: true,  fixedTo: { type: "text", label: "Next Level Approver(s)" }, statusLine: "has been approved at this level and moved forward.", noReason: true, ctaLabel: "Review & Approve" },
  approval_rejected:  { label: "Order Rejected",             defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been rejected during approval.", actorLabel: "Rejected By" },
  approval_reverted:  { label: "Order Reverted to Review",   defaultEnabled: false, fixedTo: { type: "text", label: "Original Requester" }, statusLine: "has been reverted back to Review.", actorLabel: "Reverted By" },

  issue_ready:        { label: "Ready to Issue",             defaultEnabled: true,  fixedTo: { type: "handler", key: "issue" }, statusLine: "is approved and awaiting issuance.", noReason: true, ctaLabel: "Review Order" },
  issue_issued:       { label: "Order Issued",               defaultEnabled: false, fixedTo: { type: "text", label: "Order Creator" }, statusLine: "has been issued.", noReason: true },
  issue_reverted:     { label: "Order Reverted",             defaultEnabled: false, fixedTo: { type: "text", label: "Order Creator" }, statusLine: "has been reverted back to Review.", actorLabel: "Reverted By" },
  issue_rejected:     { label: "Order Rejected",              defaultEnabled: false, fixedTo: { type: "text", label: "Order Creator" }, statusLine: "has been rejected at the issue stage.", actorLabel: "Rejected By" },
};

const dedupeByEmail = (list) => {
  const seen = new Set();
  return list.filter(u => {
    const email = (u.email || "").toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
};

/**
 * Fires the order-action notification email. Never throws — a failed/disabled
 * send should never block the actual workflow action.
 *
 * @param {object} opts
 * @param {keyof EVENTS} opts.eventKey
 * @param {{id,email,name}[]} opts.toUsers - fixed TO recipient(s) for this event (handler, approver level, or the original requester, depending on event)
 * @param {object} opts.order - { order_number, order_type, company_name, vendor_name, grand_total, created_by_email, created_by_name }
 * @param {{id,name,designation}} opts.actor - who performed the action that triggers this email
 * @param {string} [opts.reason]
 * @param {string} [opts.actorLabel] - overrides the default "Action By" wording (e.g. "Requested By" when a non-approver submits without an approval flow)
 */
async function notifyOrderAction({ eventKey, toUsers = [], order, actor, reason, actorLabel }) {
  try {
    const meta = EVENTS[eventKey];
    if (!meta) { console.error(`notifyOrderAction: unknown eventKey "${eventKey}"`); return; }

    const { data: cfgRow } = await admin
      .from("mail_notification_config")
      .select("*")
      .eq("module_key", "order")
      .eq("action_key", eventKey)
      .maybeSingle();

    const enabled = cfgRow ? cfgRow.enabled : meta.defaultEnabled;
    if (!enabled) return;

    // Self-notification skip only applies to recipients resolved automatically
    // (handler lookups, the auto-CC'd order creator) — an admin who explicitly
    // added someone as an extra TO/CC in Mail Management meant for them to
    // always get this mail, even on the rare occasion they're also the actor.
    const actorEmail = (actor?.email || "").toLowerCase();
    const autoToFiltered = toUsers.filter(u => (u?.email || "").toLowerCase() !== actorEmail);
    const to = dedupeByEmail([...autoToFiltered, ...(cfgRow?.extra_to || [])].filter(u => u?.email));
    if (to.length === 0) return; // nobody configured to receive this — nothing to send

    const ccBase = (order.created_by_email && order.created_by_email.toLowerCase() !== actorEmail)
      ? [{ email: order.created_by_email, name: order.created_by_name || order.created_by_email }]
      : [];
    const toEmails = new Set(to.map(u => u.email.toLowerCase()));
    const cc = dedupeByEmail([...ccBase, ...(cfgRow?.extra_cc || [])])
      .filter(u => !toEmails.has((u.email || "").toLowerCase()));

    // Direct/bypass events (no request ever went anywhere) use a visually
    // distinct red template; status-only events that never carry a reason
    // (approvals moving forward, withdrawals, ready-to-issue) use a blue
    // template with no Reason section at all — falls back to the normal
    // template if a variant hasn't been set up yet, so nothing silently breaks.
    const templateKey = (meta.isDirect && process.env.ZEPTOMAIL_TEMPLATE_ORDER_ACTION_DIRECT)
      || (meta.noReason && process.env.ZEPTOMAIL_TEMPLATE_ORDER_ACTION_NOREASON)
      || process.env.ZEPTOMAIL_TEMPLATE_ORDER_ACTION;
    if (!templateKey) {
      console.error("notifyOrderAction: ZEPTOMAIL_TEMPLATE_ORDER_ACTION is not set — skipping email");
      return;
    }

    await sendTemplateEmail({
      to,
      cc,
      templateKey,
      mergeInfo: {
        action_type:            meta.label,
        status_line:            meta.statusLine || "has an update.",
        order_number:           order.order_number || "",
        order_type:             order.order_type === "Supply" ? "Purchase Order" : "Work Order",
        order_subject:          order.order_subject || "",
        entity_name:            order.company_name || "",
        vendor_name:            order.vendor_name || "",
        site_name:              order.site_name || "",
        total_amount:           order.grand_total != null ? Number(order.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "",
        requester_name:         actor?.name || "",
        requester_designation:  actor?.designation || "",
        actor_name:             actor?.name || "",
        actor_designation:      actor?.designation || "",
        actor_display:          actor?.designation ? `${actor?.name || ""} (${actor.designation})` : (actor?.name || ""),
        actor_label:            actorLabel || "Action By",
        actor_at_label:         (actorLabel || "Action By").replace(/By$/, "At"),
        cta_label:              meta.ctaLabel || "View Order",
        requested_at:           new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        actor_at:               new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        reason:                 reason || "—",
        review_link:            `${process.env.FRONTEND_URL}/master-data/orders?order=${order.id}`,
        company_name:           order.company_name || "",
      },
    });
  } catch (err) {
    console.error(`notifyOrderAction(${eventKey}) failed:`, err.message);
  }
}

/** Resolve the configured handler(s) for an order action into {id,email,name} rows. */
async function getHandlerUsers(actionKey) {
  const { data } = await admin.from("request_handlers")
    .select("users").eq("module_key", "order").eq("action_key", actionKey).maybeSingle();
  const userRows = data?.users || [];
  if (!userRows.length) return [];
  const { data: users } = await admin.from("users").select("id, email, name").in("id", userRows.map(u => u.id));
  return (users || []).filter(u => u.email);
}

/** Resolve a single user id (e.g. a request's original requestor) into a {id,email,name} row. */
async function getUserRecipient(userId) {
  if (!userId) return null;
  const { data } = await admin.from("users").select("id, email, name").eq("id", userId).maybeSingle();
  return data?.email ? [data] : [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fetch and flatten the order fields notifyOrderAction() needs, from just an order id. */
async function resolveOrderForEmail(orderId) {
  const { data: order } = await admin.schema("procurement").from("purchase_orders")
    .select("id, order_number, order_type, subject, totals, snapshot, company_id, vendor_id, made_by, created_by_id, site_id")
    .eq("id", orderId).single();
  if (!order) return null;

  const snap = order.snapshot || {};
  let companyName = snap.company?.companyName || null;
  let vendorName  = snap.vendor?.vendorName || null;
  let siteName    = snap.site?.siteName || null;

  if (!companyName && order.company_id) {
    const { data: c } = await admin.schema("procurement").from("companies")
      .select("company_name").eq("id", order.company_id).maybeSingle();
    companyName = c?.company_name || null;
  }
  if (!vendorName && order.vendor_id) {
    const { data: v } = await admin.schema("procurement").from("vendors")
      .select("vendor_name").eq("id", order.vendor_id).maybeSingle();
    vendorName = v?.vendor_name || null;
  }
  if (!siteName && order.site_id) {
    const { data: s } = await admin.from("projects")
      .select("project_name").eq("id", order.site_id).maybeSingle();
    siteName = s?.project_name || null;
  }

  let createdByEmail = null, createdByName = null;
  if (order.created_by_id && UUID_RE.test(order.created_by_id)) {
    const { data: u } = await admin.from("users").select("email, name").eq("id", order.created_by_id).maybeSingle();
    createdByEmail = u?.email || null;
    createdByName  = u?.name || null;
  }

  return {
    id:               order.id,
    order_number:     order.order_number,
    order_type:       order.order_type,
    order_subject:    order.subject || "",
    company_name:     companyName,
    vendor_name:      vendorName,
    site_name:        siteName,
    grand_total:      order.totals?.grandTotal ?? null,
    created_by_email: createdByEmail,
    created_by_name:  createdByName,
  };
}

module.exports = {
  notifyOrderAction,
  getHandlerUsers,
  getUserRecipient,
  resolveOrderForEmail,
  EVENTS,
};
