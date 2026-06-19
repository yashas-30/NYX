ALTER TABLE `sessions` ADD `revoked_at` integer;--> statement-breakpoint
CREATE INDEX `idx_sessions_revoked_at` ON `sessions` (`revoked_at`);
