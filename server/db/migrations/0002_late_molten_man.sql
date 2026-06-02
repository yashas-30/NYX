CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`folder_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `chat_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `chat_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`parent_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`is_pinned` integer DEFAULT false,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `code_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`workspace_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `code_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`timestamp` integer NOT NULL,
	`tool_calls` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `code_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prompt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`type` text NOT NULL
);
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
