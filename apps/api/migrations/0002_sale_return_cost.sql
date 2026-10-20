ALTER TABLE `sale_return_lines` ADD `cost_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `sale_return_lines` SET `cost_amount` = round(`quantity` * `unit_cost`);
