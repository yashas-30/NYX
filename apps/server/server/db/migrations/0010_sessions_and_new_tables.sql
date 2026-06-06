CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`is_stream_nonce` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sessions_token_hash_unique` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `db_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model_id` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `db_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'success',
	`latency_ms` integer,
	`tokens` integer,
	`tps` real,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`session_id`) REFERENCES `db_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `db_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`tokens` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `db_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`metric` text NOT NULL,
	`critique` text NOT NULL,
	`rule` text NOT NULL,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `db_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`expires_at` integer,
	`hit_count` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`avg_tokens` real,
	`avg_latency` real,
	`success_rate` real,
	`user_rating` real,
	`is_active` integer DEFAULT false NOT NULL
);
