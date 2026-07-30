CREATE TABLE `community_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`business_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`business_type` text,
	`edition` text DEFAULT 'community' NOT NULL,
	`terms_accepted` integer NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_version` text NOT NULL,
	`feedback_consent` integer DEFAULT false NOT NULL,
	`registered_at` text NOT NULL,
	`survey_due_at` text,
	`survey_status` text DEFAULT 'not_due' NOT NULL,
	`welcome_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_registrations_product_id_unique` ON `community_registrations` (`product_id`);