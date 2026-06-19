CREATE TABLE `db_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`expires_at` integer,
	`hit_count` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `db_messages` (
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
CREATE TABLE `db_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`metric` text NOT NULL,
	`critique` text NOT NULL,
	`rule` text NOT NULL,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `db_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model_id` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `db_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`tokens` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP
);
