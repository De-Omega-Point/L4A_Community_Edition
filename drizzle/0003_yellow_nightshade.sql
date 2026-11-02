CREATE TABLE `registered_products` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_hash` text NOT NULL,
	`kind` text NOT NULL,
	`contact_name` text NOT NULL,
	`business_name` text,
	`email` text NOT NULL,
	`registered_at` text NOT NULL,
	`terms_accepted_at` text NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_acknowledged_at` text NOT NULL,
	`privacy_version` text NOT NULL,
	`marketing_consent` integer DEFAULT 0 NOT NULL,
	`marketing_consent_at` text,
	`marketing_consent_version` text,
	`created_at` text NOT NULL,
	`app_opened_at` text,
	`install_requested_at` text,
	`install_observed_at` text,
	CONSTRAINT "registered_products_id_length" CHECK(length("registered_products"."id") = 36),
	CONSTRAINT "registered_products_receipt_hash" CHECK(length("registered_products"."receipt_hash") = 64 AND "registered_products"."receipt_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "registered_products_kind" CHECK("registered_products"."kind" IN ('business', 'individual')),
	CONSTRAINT "registered_products_contact_length" CHECK(length("registered_products"."contact_name") BETWEEN 1 AND 120),
	CONSTRAINT "registered_products_email_length" CHECK(length("registered_products"."email") BETWEEN 3 AND 254),
	CONSTRAINT "registered_products_marketing_choice" CHECK("registered_products"."marketing_consent" IN (0, 1)),
	CONSTRAINT "registered_products_business_name" CHECK(("registered_products"."kind" = 'business' AND "registered_products"."business_name" IS NOT NULL AND length("registered_products"."business_name") BETWEEN 1 AND 120) OR ("registered_products"."kind" = 'individual' AND "registered_products"."business_name" IS NULL)),
	CONSTRAINT "registered_products_marketing_evidence" CHECK(("registered_products"."marketing_consent" = 1 AND "registered_products"."marketing_consent_at" IS NOT NULL AND "registered_products"."marketing_consent_version" IS NOT NULL) OR ("registered_products"."marketing_consent" = 0 AND "registered_products"."marketing_consent_at" IS NULL AND "registered_products"."marketing_consent_version" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registered_products_receipt_hash_unique` ON `registered_products` (`receipt_hash`);--> statement-breakpoint
CREATE INDEX `registered_products_created_at_idx` ON `registered_products` ("created_at" DESC,`id`);