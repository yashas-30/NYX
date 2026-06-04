CREATE TABLE `chat_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chat_conversations` ADD `folder_id` text REFERENCES `chat_folders`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `parent_id` text;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `is_pinned` integer DEFAULT false;
--> statement-breakpoint
DROP TABLE IF EXISTS `usage_costs`;
--> statement-breakpoint
CREATE TABLE `usage_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`estimated_cost_usd` real,
	`session_id` text,
	`timestamp` integer NOT NULL
);
