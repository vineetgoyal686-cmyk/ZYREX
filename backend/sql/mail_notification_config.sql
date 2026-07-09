-- Mail Management: per (module, action) email notification config.
-- Fixed recipients (the handler/approver in TO, the order creator in CC) are
-- NOT stored here — they're resolved at send-time from request_handlers /
-- approval flow levels / the order itself. This table only holds the
-- ADDITIONAL recipients an admin layers on top, plus an on/off switch.

CREATE TABLE IF NOT EXISTS mail_notification_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  text NOT NULL,
  action_key  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  extra_to    jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_cc    jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (module_key, action_key)
);

NOTIFY pgrst, 'reload schema';
