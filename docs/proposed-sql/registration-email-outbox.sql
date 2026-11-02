-- PROPOSAL ONLY: not in the applied Drizzle journal; never run automatically.
-- Reconcile against exact live schema, generate a NEW migration and obtain approval.
-- Applying the trigger starts queuing NEW registrations. No existing-row backfill.
CREATE TABLE registration_email_outbox (
  product_id TEXT PRIMARY KEY REFERENCES registered_products(id) ON DELETE CASCADE,
  payload TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed','uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 5),
  available_at INTEGER NOT NULL,
  lease_id TEXT,
  lease_until INTEGER,
  accepted_at INTEGER,
  provider_id TEXT,
  failure_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TRIGGER registration_email_outbox_insert AFTER INSERT ON registered_products
BEGIN
  INSERT INTO registration_email_outbox(product_id,payload,available_at,created_at)
  VALUES (NEW.id,json_object('name',NEW.contact_name,'businessName',NEW.business_name,
    'email',NEW.email,'productId',NEW.id,'registeredAt',NEW.registered_at,
    'marketingConsent',NEW.marketing_consent),unixepoch()*1000,unixepoch()*1000);
END;

-- Do not subsequently email superseded contact/consent details. A request already
-- accepted by the provider cannot be recalled by a database update.
CREATE TRIGGER registration_email_outbox_changed
AFTER UPDATE OF contact_name,business_name,email,marketing_consent ON registered_products
WHEN NEW.contact_name IS NOT OLD.contact_name OR NEW.business_name IS NOT OLD.business_name
  OR NEW.email IS NOT OLD.email OR NEW.marketing_consent IS NOT OLD.marketing_consent
BEGIN
  UPDATE registration_email_outbox
  SET state = CASE WHEN state = 'sending' THEN 'uncertain' ELSE 'failed' END,
      payload = NULL, lease_id = NULL, lease_until = NULL, failure_code = 'registration_changed'
  WHERE product_id = NEW.id AND state <> 'accepted';
END;
