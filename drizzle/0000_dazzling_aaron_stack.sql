CREATE TABLE `multiplayer_matches` (
	`code` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`turn` integer NOT NULL,
	`state_json` text NOT NULL,
	`resolution_json` text,
	`host_token_hash` text NOT NULL,
	`guest_token_hash` text,
	`host_name` text NOT NULL,
	`guest_name` text,
	`host_submitted_turn` integer,
	`guest_submitted_turn` integer,
	`winner` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_multiplayer_matches_status_updated` ON `multiplayer_matches` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `multiplayer_orders` (
	`match_code` text NOT NULL,
	`turn` integer NOT NULL,
	`side` text NOT NULL,
	`orders_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`match_code`, `turn`, `side`),
	FOREIGN KEY (`match_code`) REFERENCES `multiplayer_matches`(`code`) ON UPDATE no action ON DELETE cascade
);
