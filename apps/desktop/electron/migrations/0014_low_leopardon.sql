CREATE TABLE IF NOT EXISTS `costumes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL DEFAULT '',
	`category` text NOT NULL DEFAULT '',
	`description` text NOT NULL DEFAULT '',
	`character_ids` text NOT NULL DEFAULT '[]',
	`thumbnail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `series_costume_links` (
	`project_id` text NOT NULL,
	`series_id` text NOT NULL,
	`costume_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY (`series_id`, `costume_id`)
);
