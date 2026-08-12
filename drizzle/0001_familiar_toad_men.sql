ALTER TABLE `multiplayer_matches` ADD `deadline_at` integer;--> statement-breakpoint
ALTER TABLE `multiplayer_matches` ADD `last_turn_timed_out` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `multiplayer_matches` ADD `completion_reason` text;--> statement-breakpoint
ALTER TABLE `multiplayer_matches` ADD `conceded_by` text;