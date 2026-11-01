-- REVIEW PROPOSAL ONLY. This file is outside drizzle/ and is NOT an automatic migration.
-- Apply nothing to any remote database before explicit schema/rollout approval.
-- Terms/privacy/marketing notice version 2026-10-17-registration-1 is a draft:
-- review the actual notices before launch. Identity and email are self-reported.
-- Existing community_registrations, customers and browser records are untouched.
CREATE TABLE registered_products (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  receipt_hash TEXT NOT NULL UNIQUE CHECK (length(receipt_hash) = 64 AND receipt_hash NOT GLOB '*[^0-9a-f]*'),
  kind TEXT NOT NULL CHECK (kind IN ('business', 'individual')),
  contact_name TEXT NOT NULL CHECK (length(contact_name) BETWEEN 1 AND 120),
  business_name TEXT,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  registered_at TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_acknowledged_at TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
  marketing_consent_at TEXT,
  marketing_consent_version TEXT,
  created_at TEXT NOT NULL,
  app_opened_at TEXT,
  install_requested_at TEXT,
  install_observed_at TEXT,
  CHECK ((kind = 'business' AND business_name IS NOT NULL AND length(business_name) BETWEEN 1 AND 120)
      OR (kind = 'individual' AND business_name IS NULL)),
  CHECK ((marketing_consent = 1 AND marketing_consent_at IS NOT NULL AND marketing_consent_version IS NOT NULL)
      OR (marketing_consent = 0 AND marketing_consent_at IS NULL AND marketing_consent_version IS NULL))
);
CREATE INDEX registered_products_created_at_idx ON registered_products (created_at DESC, id);
-- Store only SHA-256 receipt digests, never raw cookies, IPs or user agents.
-- The server-generated UUID is a public Product ID, NOT a password/access key.
-- A unique receipt digest makes repeated/concurrent registration idempotent.
-- Email is not unique and cannot recover, claim or overwrite an existing row.
-- First-event timestamps are browser-reported observations, NOT download counts.
-- Registration does not establish that the supplied identity/email is verified.
