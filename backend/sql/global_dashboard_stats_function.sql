-- ============================================================================
-- Global Dashboard stats — moved server-side (Postgres) so the endpoint stays
-- fast regardless of how many purchase_orders exist (lakhs of rows).
--
-- Previously: backend pulled every non-Deleted purchase_order row (incl. the
-- full `snapshot` JSON blob) into Node and aggregated it in a JS loop. That
-- doesn't scale — network transfer + JS iteration grows linearly with row
-- count. This function does the same aggregation with GROUP BY inside
-- Postgres and returns only the small aggregated JSON payload.
--
-- HOW TO APPLY: paste this whole file into the Supabase SQL Editor and run
-- it once. It only creates a function + indexes — it does not touch data.
-- ============================================================================

-- Indexes that make the aggregation scan fast at scale.
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON procurement.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON procurement.purchase_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id
  ON procurement.purchase_orders (vendor_id);

CREATE OR REPLACE FUNCTION procurement.get_global_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH base AS MATERIALIZED (
  SELECT
    po.id,
    po.order_number,
    po.status,
    CASE WHEN po.order_type = 'Supply' THEN 'po' ELSE 'wo' END AS otype,
    COALESCE((po.totals ->> 'grandTotal')::numeric, 0) AS grand_total,
    ROUND(COALESCE((po.totals ->> 'grandTotal')::numeric, 0) / 100000.0, 2) AS val_l,
    (EXTRACT(MONTH FROM (po.created_at AT TIME ZONE 'Asia/Kolkata')))::int - 1 AS month_idx,
    COALESCE(NULLIF(po.snapshot -> 'company' ->> 'companyCode', ''), NULLIF(po.snapshot -> 'company' ->> 'company_code', '')) AS entity_code,
    COALESCE(NULLIF(po.snapshot -> 'company' ->> 'companyName', ''), NULLIF(po.snapshot -> 'company' ->> 'company_name', ''), 'Unknown') AS entity_name,
    COALESCE(NULLIF(po.snapshot -> 'site' ->> 'siteCode', ''), NULL) AS site_code,
    COALESCE(NULLIF(po.snapshot -> 'site' ->> 'siteName', ''), NULLIF(po.snapshot -> 'site' ->> 'siteCode', ''), po.site_id::text, 'Unknown') AS site_name,
    COALESCE(NULLIF(po.snapshot ->> 'category', ''), NULLIF(po.snapshot ->> 'category_name', ''), po.category_id::text, 'Other') AS category_name,
    COALESCE(NULLIF(v.vendor_name, ''), NULLIF(po.snapshot -> 'vendor' ->> 'name', ''), NULLIF(po.snapshot -> 'vendor' ->> 'vendor_name', ''), 'Unknown') AS vendor_name,
    COALESCE(u.name, NULLIF(po.made_by::text, ''), 'System') AS made_by_name,
    (COALESCE(po.updated_at, po.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS since_date
  FROM procurement.purchase_orders po
  LEFT JOIN procurement.vendors v ON v.id = po.vendor_id
  LEFT JOIN public.users u ON u.id::text = po.made_by::text
  WHERE po.status <> 'Deleted'
),
entity_key AS MATERIALIZED (
  SELECT *, COALESCE(entity_code, entity_name) AS ekey FROM base
),
site_key AS MATERIALIZED (
  SELECT *, COALESCE(site_code, site_name) AS skey FROM entity_key
),
months AS (
  SELECT ord - 1 AS mi, mn
  FROM unnest(ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])
       WITH ORDINALITY AS t(mn, ord)
),
monthly_agg AS (
  SELECT month_idx,
         ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype = 'po'), 0), 2) AS po_l,
         ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype = 'wo'), 0), 2) AS wo_l,
         COUNT(*) FILTER (WHERE otype = 'po') AS po_c,
         COUNT(*) FILTER (WHERE otype = 'wo') AS wo_c
  FROM site_key
  GROUP BY month_idx
),
site_month_agg AS (
  SELECT month_idx, site_code,
         ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype = 'po'), 0), 2) AS po_l,
         ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype = 'wo'), 0), 2) AS wo_l,
         COUNT(*) AS orders_c,
         COUNT(*) FILTER (WHERE otype = 'po') AS po_c,
         COUNT(*) FILTER (WHERE otype = 'wo') AS wo_c
  FROM site_key
  WHERE site_code IS NOT NULL
  GROUP BY month_idx, site_code
),
user_agg AS (
  SELECT made_by_name,
         COUNT(*) FILTER (WHERE otype = 'po') AS po_c,
         COUNT(*) FILTER (WHERE otype = 'wo') AS wo_c,
         COUNT(*) AS total_c,
         ROUND(COALESCE(SUM(val_l), 0), 2) AS value_l
  FROM site_key
  GROUP BY made_by_name
),
user_site_agg AS (
  SELECT made_by_name, site_code,
         COUNT(*) FILTER (WHERE otype = 'po') AS po_c,
         COUNT(*) FILTER (WHERE otype = 'wo') AS wo_c
  FROM site_key
  WHERE site_code IS NOT NULL
  GROUP BY made_by_name, site_code
)
SELECT jsonb_build_object(

  'orders', (
    SELECT jsonb_build_object(
      'total',        jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po'), 'wo', COUNT(*) FILTER (WHERE otype='wo'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo'),0)),
      'draft',        jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Draft'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Draft'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Draft'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Draft'),0)),
      'review',       jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Review'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Review'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Review'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Review'),0)),
      'pendingIssue', jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Pending Issue'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Pending Issue'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Pending Issue'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Pending Issue'),0)),
      'issued',       jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Issued'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Issued'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Issued'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Issued'),0)),
      'amended',      jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Amended'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Amended'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Amended'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Amended'),0)),
      'amendPending', jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Amend Pending'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Amend Pending'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Amend Pending'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Amend Pending'),0)),
      'reverted',     jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Reverted'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Reverted'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Reverted'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Reverted'),0)),
      'recalled',     jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Recalled'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Recalled'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Recalled'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Recalled'),0)),
      'rejected',     jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Rejected'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Rejected'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Rejected'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Rejected'),0)),
      'cancelled',    jsonb_build_object('po', COUNT(*) FILTER (WHERE otype='po' AND status='Cancelled'), 'wo', COUNT(*) FILTER (WHERE otype='wo' AND status='Cancelled'), 'poValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='po' AND status='Cancelled'),0), 'woValue', COALESCE(SUM(grand_total) FILTER (WHERE otype='wo' AND status='Cancelled'),0))
    ) FROM site_key
  ),

  'entitySpend', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('entity', ekey, 'name', entity_name, 'code', COALESCE(entity_code,''), 'po', po_l, 'wo', wo_l)), '[]'::jsonb)
    FROM (
      SELECT ekey, MAX(entity_name) AS entity_name, MAX(entity_code) AS entity_code,
             ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype='po'),0),2) AS po_l,
             ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype='wo'),0),2) AS wo_l
      FROM site_key GROUP BY ekey
    ) e
  ),

  'siteSpend', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('site', skey, 'name', site_name, 'code', COALESCE(site_code,''), 'po', po_l, 'wo', wo_l)), '[]'::jsonb)
    FROM (
      SELECT skey, MAX(site_name) AS site_name, MAX(site_code) AS site_code,
             ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype='po'),0),2) AS po_l,
             ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype='wo'),0),2) AS wo_l
      FROM site_key GROUP BY skey
    ) s
  ),

  'categorySpend', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category_name, 'po', po_l, 'wo', wo_l) ORDER BY (po_l + wo_l) DESC), '[]'::jsonb)
    FROM (
      SELECT category_name,
             ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype='po'),0),2) AS po_l,
             ROUND(COALESCE(SUM(val_l) FILTER (WHERE otype='wo'),0),2) AS wo_l
      FROM site_key GROUP BY category_name
      ORDER BY (COALESCE(SUM(val_l) FILTER (WHERE otype='po'),0) + COALESCE(SUM(val_l) FILTER (WHERE otype='wo'),0)) DESC
      LIMIT 10
    ) c
  ),

  'monthlySpend', (
    SELECT jsonb_agg(jsonb_build_object('month', months.mn, 'po', COALESCE(ma.po_l,0), 'wo', COALESCE(ma.wo_l,0)) ORDER BY months.mi)
    FROM months LEFT JOIN monthly_agg ma ON ma.month_idx = months.mi
  ),

  'monthlyCount', (
    SELECT jsonb_agg(jsonb_build_object('month', months.mn, 'po', COALESCE(ma.po_c,0), 'wo', COALESCE(ma.wo_c,0)) ORDER BY months.mi)
    FROM months LEFT JOIN monthly_agg ma ON ma.month_idx = months.mi
  ),

  'monthlySpendBySite', (
    SELECT jsonb_object_agg(months.mn, COALESCE(arr.items, '[]'::jsonb))
    FROM months
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('code', sma.site_code, 'po', sma.po_l, 'wo', sma.wo_l, 'orders', sma.orders_c)) AS items
      FROM site_month_agg sma WHERE sma.month_idx = months.mi
    ) arr ON true
  ),

  'monthlyCountBySite', (
    SELECT jsonb_object_agg(months.mn, COALESCE(arr.items, '[]'::jsonb))
    FROM months
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('code', sma.site_code, 'po', sma.po_c, 'wo', sma.wo_c)) AS items
      FROM site_month_agg sma WHERE sma.month_idx = months.mi
    ) arr ON true
  ),

  'topVendorsPO', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', vendor_name, 'value', po_l, 'count', po_c) ORDER BY po_l DESC), '[]'::jsonb)
    FROM (
      SELECT vendor_name, ROUND(SUM(val_l),2) AS po_l, COUNT(*) AS po_c
      FROM site_key WHERE otype='po'
      GROUP BY vendor_name HAVING SUM(val_l) > 0
      ORDER BY SUM(val_l) DESC LIMIT 5
    ) tv
  ),

  'topVendorsWO', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', vendor_name, 'value', wo_l, 'count', wo_c) ORDER BY wo_l DESC), '[]'::jsonb)
    FROM (
      SELECT vendor_name, ROUND(SUM(val_l),2) AS wo_l, COUNT(*) AS wo_c
      FROM site_key WHERE otype='wo'
      GROUP BY vendor_name HAVING SUM(val_l) > 0
      ORDER BY SUM(val_l) DESC LIMIT 5
    ) tv
  ),

  'userOrderData', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', ua.made_by_name, 'po', ua.po_c, 'wo', ua.wo_c, 'total', ua.total_c, 'value', ua.value_l,
        'sites', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('code', usa.site_code, 'po', usa.po_c, 'wo', usa.wo_c))
          FROM user_site_agg usa WHERE usa.made_by_name = ua.made_by_name
        ), '[]'::jsonb)
      ) ORDER BY ua.total_c DESC), '[]'::jsonb)
    FROM user_agg ua
  ),

  'agingOrders', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'orderNo',   b.order_number,
        'type',      CASE WHEN b.otype='po' THEN 'PO' ELSE 'WO' END,
        'vendor',    b.vendor_name,
        'value',     '₹' || trim_scale(b.val_l)::text || 'L',
        'rawValue',  b.grand_total,
        'status',    b.status,
        'pendingAt', b.made_by_name,
        'days',      GREATEST(0, ((now() AT TIME ZONE 'Asia/Kolkata')::date - b.since_date))::int,
        'since',     to_char(b.since_date, 'DD Mon'),
        'site',      b.site_name,
        'siteCode',  COALESCE(b.site_code, ''),
        'entity',    b.entity_name
      ) ORDER BY ((now() AT TIME ZONE 'Asia/Kolkata')::date - b.since_date) DESC), '[]'::jsonb)
    FROM site_key b
    WHERE b.status IN ('Review','Pending Issue','Amend Pending')
  )

);
$$;

GRANT EXECUTE ON FUNCTION procurement.get_global_dashboard_stats() TO service_role;

-- Make PostgREST pick up the new function immediately instead of waiting
-- for its periodic schema-cache refresh.
NOTIFY pgrst, 'reload schema';
