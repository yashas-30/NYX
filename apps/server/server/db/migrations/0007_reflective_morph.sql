CREATE TABLE IF NOT EXISTS `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`task` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`tokens_used` integer,
	`cost` real,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_status_started` ON `agent_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `file_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`file_path` text NOT NULL,
	`operation` text NOT NULL,
	`diff` text,
	`applied_at` integer NOT NULL,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tool_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`duration_ms` integer,
	`success` integer,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tool_executions_run_id` ON `tool_executions` (`agent_run_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_timestamp` ON `messages` (`conversation_id`,`timestamp`);