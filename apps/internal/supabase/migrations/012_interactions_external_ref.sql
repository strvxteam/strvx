-- Migration 012: Add external_ref column to interactions for webhook idempotency
--
-- The Drizzle schema (packages/db/src/schema.ts) declares
--   externalRef: text("external_ref").unique()
-- but the column was never added to production. This silently broke every
-- Drizzle INSERT into interactions (booking → CRM record creation, internal
-- app interaction logging, etc.) with "column external_ref does not exist".

ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS interactions_external_ref_unique
  ON interactions (external_ref)
  WHERE external_ref IS NOT NULL;
