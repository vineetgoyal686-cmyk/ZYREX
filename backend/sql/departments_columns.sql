-- Add dept_id and division_id columns to departments table
-- Run this in Supabase SQL Editor

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS dept_id    TEXT,
  ADD COLUMN IF NOT EXISTS division_id TEXT;

-- Optional: create index for faster division lookups
CREATE INDEX IF NOT EXISTS idx_departments_division_id ON departments(division_id);
