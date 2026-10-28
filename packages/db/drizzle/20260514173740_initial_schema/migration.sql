CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_account_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `achievement_unlocks` (
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`unlocked_at` text NOT NULL,
	`match_id` text,
	CONSTRAINT `achievement_unlocks_pk` PRIMARY KEY(`user_id`, `achievement_id`)
);
--> statement-breakpoint
CREATE TABLE `cosmetic_acknowledgements` (
	`player_id` text NOT NULL,
	`unlock_id` text NOT NULL,
	`acknowledged_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `cosmetic_acknowledgements_pk` PRIMARY KEY(`player_id`, `unlock_id`)
);
--> statement-breakpoint
CREATE TABLE `cosmetic_equips` (
	`player_id` text NOT NULL,
	`slot` text NOT NULL,
	`unlock_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `cosmetic_equips_pk` PRIMARY KEY(`player_id`, `slot`)
);
--> statement-breakpoint
CREATE TABLE `daily_results` (
	`user_id` text NOT NULL,
	`daily_date` text NOT NULL,
	`username` text NOT NULL,
	`challenge_id` text DEFAULT 'capture-five-villages' NOT NULL,
	`best_turns` integer NOT NULL,
	`completion_count` integer DEFAULT 1 NOT NULL,
	`first_completed_at` text NOT NULL,
	`last_completed_at` text NOT NULL,
	CONSTRAINT `daily_results_pk` PRIMARY KEY(`user_id`, `daily_date`)
);
--> statement-breakpoint
CREATE TABLE `match_results` (
	`match_id` text PRIMARY KEY,
	`winner_tribe` text,
	`players` text NOT NULL,
	`duration` integer NOT NULL,
	`turn_count` integer NOT NULL,
	`map_size` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_match_results` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`username` text NOT NULL,
	`tribe` text NOT NULL,
	`is_winner` integer NOT NULL,
	`is_bot` integer NOT NULL,
	`completed_at` text NOT NULL,
	CONSTRAINT `player_match_results_pk` PRIMARY KEY(`match_id`, `player_id`),
	CONSTRAINT `fk_player_match_results_match_id_match_results_match_id_fk` FOREIGN KEY (`match_id`) REFERENCES `match_results`(`match_id`)
);
--> statement-breakpoint
CREATE TABLE `saved_matches` (
	`user_id` text PRIMARY KEY,
	`saved_match_id` text NOT NULL,
	`revision` integer NOT NULL,
	`base_revision` integer,
	`status` text NOT NULL,
	`schema_version` integer NOT NULL,
	`game_logic_version` text NOT NULL,
	`player_tribe` text NOT NULL,
	`map_size` text NOT NULL,
	`opponent_count` integer NOT NULL,
	`difficulty` text NOT NULL,
	`turn` integer NOT NULL,
	`winner` text,
	`updated_at` text NOT NULL,
	`payload` text NOT NULL,
	CONSTRAINT `fk_saved_matches_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	CONSTRAINT `fk_session_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`image` text,
	`username` text UNIQUE,
	`displayUsername` text,
	`emailVerified` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_achievement_unlocks_user` ON `achievement_unlocks` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_results_date_turns` ON `daily_results` (`daily_date`,`best_turns`);--> statement-breakpoint
CREATE INDEX `idx_daily_results_user_date` ON `daily_results` (`user_id`,`daily_date`);--> statement-breakpoint
CREATE INDEX `idx_pmr_player_completed` ON `player_match_results` (`player_id`,"completed_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_pmr_tribe_winner` ON `player_match_results` (`tribe`,`is_winner`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);