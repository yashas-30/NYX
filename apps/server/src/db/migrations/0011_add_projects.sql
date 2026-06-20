CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text DEFAULT '📁',
	`model` text DEFAULT 'gemini-2.5-flash',
	`instructions` text,
	`files` text DEFAULT '[]',
	`sessions` text DEFAULT '[]',
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
