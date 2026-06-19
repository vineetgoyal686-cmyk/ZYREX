// backend/fix_orders.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env.local"), override: true });
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function repair() {
  console.log("Starting data repair...");

  // 1. Fetch all orders that are NOT Issued
  const { data: orders, error: fetchErr } = await supabase.schema("procurement")
    .from("purchase_orders")
    .select("id, status, order_number, company_id, site_id, vendor_id, contact_person_id")
    .neq("status", "Issued");

  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }

  console.log(`Found ${orders.length} non-issued orders to check.`);

  // 2. Fetch Master Data for Mapping
  const { data: companies } = await supabase.schema("procurement").from("companies").select("id, company_name, company_code");
  const { data: sites } = await supabase.from("projects").select("id, project_name, project_code");
  const { data: vendors } = await supabase.schema("procurement").from("vendors").select("id, vendor_name");

  for (const order of orders) {
    const updates = {};
    
    // Fix Numbering if it looks like an official number
    if (!order.order_number.startsWith("PENDING-")) {
      updates.order_number = `PENDING-REPAIRED-${Math.floor(Math.random() * 10000)}`;
      console.log(`Reparing number for Order ID ${order.id}: ${order.order_number} -> ${updates.order_number}`);
    }

    // Repair Snapshot
    const comp = companies.find(c => c.id === order.company_id);
    const site = sites.find(s => s.id === order.site_id);
    const vend = vendors.find(v => v.id === order.vendor_id);

    updates.snapshot = {
      company: comp || null,
      site: site || null,
      vendor: vend || null
    };

    const { error: updErr } = await supabase.schema("procurement")
      .from("purchase_orders")
      .update(updates)
      .eq("id", order.id);

    if (updErr) console.error(`Error updating order ${order.id}:`, updErr.message);
    else console.log(`Successfully repaired Order ${order.id}`);
  }

  console.log("Repair complete!");
}

repair();
