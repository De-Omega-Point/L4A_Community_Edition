ALTER TABLE `community_registrations` ADD `updates_consent` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `community_registrations` ADD `intelligence_interests` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_registrations` ADD `membership_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_registrations` ADD `updated_at` text DEFAULT '' NOT NULL;