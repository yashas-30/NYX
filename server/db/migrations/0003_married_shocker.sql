ALTER TABLE `chat_conversations` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `chat_conversations` ADD `share_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_conversations_share_id_unique` ON `chat_conversations` (`share_id`);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `token_usage` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachments` text;