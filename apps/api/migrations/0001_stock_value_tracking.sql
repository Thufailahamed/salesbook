ALTER TABLE `invoice_lines` ADD `cost_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `cost_returned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_levels` ADD `value` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `invoice_lines` SET `cost_amount` = round(`quantity` * `unit_cost`);--> statement-breakpoint
UPDATE `invoice_lines` SET `cost_returned` = coalesce((SELECT sum(round(`srl`.`quantity` * `srl`.`unit_cost`)) FROM `sale_return_lines` `srl` WHERE `srl`.`invoice_line_id` = `invoice_lines`.`id`), 0);--> statement-breakpoint
UPDATE `stock_levels` SET `value` = round(`quantity` * coalesce((SELECT `v`.`cost_price` FROM `variants` `v` WHERE `v`.`id` = `stock_levels`.`variant_id`), 0));
