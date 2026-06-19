CREATE TABLE IF NOT EXISTS `prompt_optimizations` (
	`id` text PRIMARY KEY NOT NULL,
	`original_prompt` text NOT NULL,
	`optimized_prompt` text NOT NULL,
	`domain` text NOT NULL,
	`version` text NOT NULL,
	`rating` integer,
	`timestamp` integer NOT NULL
);
