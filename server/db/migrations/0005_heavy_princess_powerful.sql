CREATE TABLE `search_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`engine` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_results` (
	`id` text PRIMARY KEY NOT NULL,
	`query_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	`rank` integer NOT NULL,
	FOREIGN KEY (`query_id`) REFERENCES `search_queries`(`id`) ON UPDATE no action ON DELETE cascade
);
