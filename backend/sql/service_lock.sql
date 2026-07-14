-- Service Lock: a single-row switch a global_admin can flip to block every
-- other user (including super_admin/admin) from using the software (e.g.
-- client hasn't cleared payment). Only global_admin is exempt, so they can
-- log in and turn it back off.

CREATE TABLE IF NOT EXISTS service_lock (
  id            int PRIMARY KEY DEFAULT 1,
  is_locked     boolean NOT NULL DEFAULT false,
  message       text NOT NULL DEFAULT 'Your card payment has failed. Please complete the payment to resume service.',
  updated_by_id uuid,
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT service_lock_singleton CHECK (id = 1)
);

INSERT INTO service_lock (id, is_locked, message)
VALUES (1, false, 'Your card payment has failed. Please complete the payment to resume service.')
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
