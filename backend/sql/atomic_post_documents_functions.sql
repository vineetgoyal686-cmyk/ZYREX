-- Atomic post_documents array operations for purchase_orders.
-- Fixes a race condition where two near-simultaneous uploads/deletes on the
-- same order could silently overwrite each other (read-modify-write from the
-- app side is not atomic; these functions push the read+write into a single
-- UPDATE statement so Postgres serializes concurrent calls safely).

CREATE OR REPLACE FUNCTION procurement.append_post_document(p_order_id uuid, p_doc jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE procurement.purchase_orders
  SET post_documents = COALESCE(post_documents, '[]'::jsonb) || jsonb_build_array(p_doc)
  WHERE id = p_order_id
  RETURNING post_documents;
$$;

CREATE OR REPLACE FUNCTION procurement.remove_post_document(p_order_id uuid, p_doc_id text)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE procurement.purchase_orders
  SET post_documents = COALESCE(
    (SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(post_documents, '[]'::jsonb)) elem
     WHERE elem->>'id' != p_doc_id),
    '[]'::jsonb
  )
  WHERE id = p_order_id
  RETURNING post_documents;
$$;

CREATE OR REPLACE FUNCTION procurement.upsert_signed_copy(p_order_id uuid, p_doc jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE procurement.purchase_orders
  SET post_documents = COALESCE(
    (SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(post_documents, '[]'::jsonb)) elem
     WHERE elem->>'category' != 'signed-copy'),
    '[]'::jsonb
  ) || jsonb_build_array(p_doc)
  WHERE id = p_order_id
  RETURNING post_documents;
$$;

CREATE OR REPLACE FUNCTION procurement.remove_signed_copy(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE procurement.purchase_orders
  SET post_documents = COALESCE(
    (SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(post_documents, '[]'::jsonb)) elem
     WHERE elem->>'category' != 'signed-copy'),
    '[]'::jsonb
  )
  WHERE id = p_order_id
  RETURNING post_documents;
$$;
