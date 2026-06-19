CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`event` text NOT NULL,
	`status` text NOT NULL,
	`agent_run_id` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pending_file_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`file_path` text NOT NULL,
	`content` text NOT NULL,
	`diff` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
