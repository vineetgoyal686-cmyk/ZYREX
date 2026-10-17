-- Boardroom Finance — wipe demo data. Run by hand in the Supabase SQL editor.
-- Only touches Boardroom Finance tables; the real Projects / Companies /
-- Vendors lists used by Procurement are never affected.

begin;

-- ── Part 1: entries (always run) ─────────────────────────────────────────
-- Every Payment/Receipt row, including ones already sent to trash.
delete from boardroom_finance_entries;

-- Their Log-panel history.
delete from procurement.audit_logs where entity_type = 'boardroom_finance_entry';

-- Their attachments. Supabase blocks deleting from storage.objects in SQL,
-- so clear the "boardroom" bucket's entries/ folder in the Storage UI
-- (or leave it — orphaned files are harmless, they just use space).

-- ── Part 2: dropdown lists (optional — delete this block to keep them) ───
-- Sites / Companies / Vendors added via "+ Add New" in this tab
delete from boardroom_finance_quick_sites;
delete from boardroom_finance_quick_companies;
delete from boardroom_finance_quick_vendors;
-- Purpose (PUR-n) and account numbers (ACC-n) — numbering restarts at 1
delete from boardroom_finance_coded_values;
-- Remembered Account Holder names
delete from boardroom_finance_saved_values;
-- Custom columns back to empty (the 5 slots must stay, so reset them)
update boardroom_finance_custom_columns set label = null, is_active = false, updated_at = now();

commit;
