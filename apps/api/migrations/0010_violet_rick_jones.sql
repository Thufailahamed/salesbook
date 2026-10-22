ALTER TABLE `invoices` ADD `client_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_client_ref_uq` ON `invoices` (`business_id`,`client_ref`);