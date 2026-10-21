CREATE TABLE `stock_lots` (
	`business_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`location_id` text NOT NULL,
	`expiry_date` text DEFAULT '' NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`variant_id`, `location_id`, `expiry_date`)
);
--> statement-breakpoint
CREATE INDEX `stock_lots_business_idx` ON `stock_lots` (`business_id`,`location_id`);--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `expiry_date` text;--> statement-breakpoint
-- Existing stock has no expiry dates yet: put it all in the "no expiry" lot so lots add up to stock levels.
INSERT INTO `stock_lots` (`business_id`, `variant_id`, `location_id`, `expiry_date`, `quantity`)
SELECT `business_id`, `variant_id`, `location_id`, '', `quantity` FROM `stock_levels` WHERE `quantity` <> 0;
