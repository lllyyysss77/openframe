CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`sort_index` integer NOT NULL,
	`thumbnail` text,
	`duration` integer NOT NULL,
	`created_at` integer NOT NULL
);
