CREATE TABLE `telemetry_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`event_type` text NOT NULL,
	`duration_ms` integer,
	`tokens_generated` integer,
	`error_type` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_provider_model` ON `telemetry_events` (`provider`,`model`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_timestamp` ON `telemetry_events` (`timestamp`);--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `feedback` integer;