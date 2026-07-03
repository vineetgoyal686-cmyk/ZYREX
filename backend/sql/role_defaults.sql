-- Role-level default permissions (editable via Settings > Roles).
-- Run in Supabase SQL Editor if this table is not already present.
-- Stores the same shape as users.profile_permissions (the "MANAGEMENT PERMISSIONS"
-- section: manage_user, manage_project, designation, approval_flow, serialization,
-- request_handler, delegation, mail_management), keyed by role.

CREATE TABLE IF NOT EXISTS role_defaults (
  role                TEXT PRIMARY KEY,
  profile_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO role_defaults (role, profile_permissions) VALUES
  ('super_admin', '{
    "manage_user":     {"view": true, "add": true, "edit": true, "delete": true, "manage_permissions": true},
    "manage_project":  {"view": true, "add": true, "edit": true, "delete": true},
    "designation":     {"view": true, "add": true, "edit": true, "delete": true},
    "approval_flow":   {"view": true, "add": true, "edit": true, "delete": true},
    "serialization":   {"view": true, "add": true, "edit": true, "delete": true},
    "request_handler": {"view": true, "edit": true},
    "delegation":      {"view": true, "add": true, "edit": true, "delete": true},
    "mail_management": {"view": true, "add": true, "edit": true, "delete": true}
  }'::jsonb),
  ('admin', '{
    "manage_user":     {"view": true, "add": true, "edit": true, "delete": false, "manage_permissions": false},
    "manage_project":  {"view": true, "add": true, "edit": true, "delete": false},
    "designation":     {"view": true, "add": true, "edit": true, "delete": false},
    "approval_flow":   {"view": true, "add": true, "edit": true, "delete": false},
    "serialization":   {"view": true, "add": false, "edit": true, "delete": false},
    "request_handler": {"view": true, "edit": true},
    "delegation":      {"view": true, "add": true, "edit": true, "delete": false},
    "mail_management": {"view": true, "add": true, "edit": true, "delete": false}
  }'::jsonb),
  ('user', '{
    "manage_user":     {"view": false, "add": false, "edit": false, "delete": false, "manage_permissions": false},
    "manage_project":  {"view": false, "add": false, "edit": false, "delete": false},
    "designation":     {"view": false, "add": false, "edit": false, "delete": false},
    "approval_flow":   {"view": false, "add": false, "edit": false, "delete": false},
    "serialization":   {"view": false, "add": false, "edit": false, "delete": false},
    "request_handler": {"view": false, "edit": false},
    "delegation":       {"view": false, "add": false, "edit": false, "delete": false},
    "mail_management": {"view": false, "add": false, "edit": false, "delete": false}
  }'::jsonb)
ON CONFLICT (role) DO NOTHING;
