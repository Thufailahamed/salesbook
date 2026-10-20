CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text NOT NULL,
	`system_key` text,
	`is_system` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_code_uq` ON `accounts` (`business_id`,`code`);--> statement-breakpoint
CREATE INDEX `accounts_system_idx` ON `accounts` (`business_id`,`system_key`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`summary` text NOT NULL,
	`data` text,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_business_idx` ON `audit_logs` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brands_business_idx` ON `brands` (`business_id`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`email` text,
	`phone` text,
	`website` text,
	`address` text,
	`city` text,
	`country` text,
	`tax_number` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`logo_url` text,
	`tax_inclusive` integer DEFAULT true NOT NULL,
	`allow_negative_stock` integer DEFAULT false NOT NULL,
	`require_shift` integer DEFAULT false NOT NULL,
	`rounding_increment` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` real DEFAULT 5 NOT NULL,
	`default_tax_rate_id` text,
	`invoice_footer` text,
	`receipt_footer` text,
	`invoice_terms` text,
	`receipt_width` text DEFAULT '80mm' NOT NULL,
	`loyalty_enabled` integer DEFAULT false NOT NULL,
	`loyalty_earn_per` integer DEFAULT 10000 NOT NULL,
	`loyalty_point_value` integer DEFAULT 100 NOT NULL,
	`loyalty_min_redeem` integer DEFAULT 0 NOT NULL,
	`return_window_days` integer DEFAULT 30 NOT NULL,
	`credit_due_days` integer DEFAULT 30 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cash_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`shift_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`account_id` text,
	`reason` text NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_movements_shift_idx` ON `cash_movements` (`shift_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`color` text,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_business_idx` ON `categories` (`business_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`address` text,
	`tax_number` text,
	`type` text DEFAULT 'individual' NOT NULL,
	`price_tier` text DEFAULT 'retail' NOT NULL,
	`allow_credit` integer DEFAULT true NOT NULL,
	`credit_limit` integer DEFAULT 0 NOT NULL,
	`due_balance` integer DEFAULT 0 NOT NULL,
	`credit_balance` integer DEFAULT 0 NOT NULL,
	`loyalty_points` integer DEFAULT 0 NOT NULL,
	`birthday` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`total_spent` integer DEFAULT 0 NOT NULL,
	`invoice_count` integer DEFAULT 0 NOT NULL,
	`last_purchase_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_business_idx` ON `customers` (`business_id`,`name`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`business_id`,`phone`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`method_id` text,
	`payment_account_id` text,
	`supplier_id` text,
	`payee` text,
	`reference` text,
	`note` text,
	`location_id` text,
	`shift_id` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `gift_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`code` text NOT NULL,
	`initial_value` integer DEFAULT 0 NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_on` text,
	`customer_id` text,
	`note` text,
	`paid` integer DEFAULT true NOT NULL,
	`created_by` text,
	`issued_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_cards_code_uq` ON `gift_cards` (`business_id`,`code`);--> statement-breakpoint
CREATE TABLE `held_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`location_id` text NOT NULL,
	`user_id` text,
	`label` text,
	`customer_id` text,
	`cart` text,
	`total` integer DEFAULT 0 NOT NULL,
	`item_count` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `held_sales_business_idx` ON `held_sales` (`business_id`,`location_id`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`business_id` text NOT NULL,
	`variant_id` text,
	`product_id` text,
	`category_id` text,
	`name` text NOT NULL,
	`sku` text,
	`quantity` real NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`discount_type` text,
	`discount_value` real,
	`line_discount` integer DEFAULT 0 NOT NULL,
	`doc_discount` integer DEFAULT 0 NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`quantity_returned` real DEFAULT 0 NOT NULL,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_idx` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_lines_variant_idx` ON `invoice_lines` (`business_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX `invoice_lines_date_idx` ON `invoice_lines` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`kind` text DEFAULT 'sale' NOT NULL,
	`date` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`payment_status` text DEFAULT 'paid' NOT NULL,
	`location_id` text NOT NULL,
	`customer_id` text,
	`customer_name` text,
	`salesperson_id` text,
	`shift_id` text,
	`price_tier` text DEFAULT 'retail' NOT NULL,
	`tax_inclusive` integer DEFAULT true NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`item_discount` integer DEFAULT 0 NOT NULL,
	`doc_discount_type` text,
	`doc_discount_value` real,
	`doc_discount` integer DEFAULT 0 NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`net_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`shipping` integer DEFAULT 0 NOT NULL,
	`round_off` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`amount_due` integer DEFAULT 0 NOT NULL,
	`amount_returned` integer DEFAULT 0 NOT NULL,
	`cost_total` integer DEFAULT 0 NOT NULL,
	`points_earned` integer DEFAULT 0 NOT NULL,
	`points_redeemed` integer DEFAULT 0 NOT NULL,
	`item_count` real DEFAULT 0 NOT NULL,
	`note` text,
	`quotation_id` text,
	`exchange_return_id` text,
	`void_reason` text,
	`voided_at` integer,
	`voided_by` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_uq` ON `invoices` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoices_date_idx` ON `invoices` (`business_id`,`date`);--> statement-breakpoint
CREATE INDEX `invoices_customer_idx` ON `invoices` (`business_id`,`customer_id`,`date`);--> statement-breakpoint
CREATE INDEX `invoices_due_idx` ON `invoices` (`business_id`,`amount_due`);--> statement-breakpoint
CREATE INDEX `invoices_shift_idx` ON `invoices` (`shift_id`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`memo` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`source_number` text,
	`location_id` text,
	`total_debit` integer DEFAULT 0 NOT NULL,
	`reversal_of_id` text,
	`reversed_by_id` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_entries_date_idx` ON `journal_entries` (`business_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_entries_source_idx` ON `journal_entries` (`business_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`business_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`debit` integer DEFAULT 0 NOT NULL,
	`credit` integer DEFAULT 0 NOT NULL,
	`memo` text,
	`party_type` text,
	`party_id` text,
	`location_id` text
);
--> statement-breakpoint
CREATE INDEX `journal_lines_entry_idx` ON `journal_lines` (`entry_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_account_idx` ON `journal_lines` (`business_id`,`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_lines_date_idx` ON `journal_lines` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`address` text,
	`phone` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `locations_business_idx` ON `locations` (`business_id`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`doc_id` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_allocations_payment_idx` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_allocations_doc_idx` ON `payment_allocations` (`doc_type`,`doc_id`);--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`account_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_methods_business_idx` ON `payment_methods` (`business_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`direction` text NOT NULL,
	`source` text NOT NULL,
	`party_type` text DEFAULT 'none' NOT NULL,
	`party_id` text,
	`tender` text NOT NULL,
	`method_id` text,
	`account_id` text,
	`amount` integer DEFAULT 0 NOT NULL,
	`tendered` integer,
	`change` integer,
	`reference` text,
	`note` text,
	`gift_card_id` text,
	`points` integer,
	`status` text DEFAULT 'completed' NOT NULL,
	`shift_id` text,
	`location_id` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`business_id`,`date`);--> statement-breakpoint
CREATE INDEX `payments_party_idx` ON `payments` (`business_id`,`party_type`,`party_id`);--> statement-breakpoint
CREATE INDEX `payments_shift_idx` ON `payments` (`shift_id`);--> statement-breakpoint
CREATE INDEX `payments_gift_card_idx` ON `payments` (`gift_card_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'standard' NOT NULL,
	`category_id` text,
	`brand_id` text,
	`unit_id` text,
	`tax_rate_id` text,
	`track_inventory` integer DEFAULT true NOT NULL,
	`has_variants` integer DEFAULT false NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`image_url` text,
	`tags` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_business_idx` ON `products` (`business_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`business_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`business_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`quantity` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`discount_type` text,
	`discount_value` real,
	`line_discount` integer DEFAULT 0 NOT NULL,
	`doc_discount` integer DEFAULT 0 NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`landed_unit_cost` integer DEFAULT 0 NOT NULL,
	`quantity_returned` real DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_lines_purchase_idx` ON `purchase_lines` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `purchase_return_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`business_id` text NOT NULL,
	`purchase_line_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`quantity` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_return_lines_return_idx` ON `purchase_return_lines` (`return_id`);--> statement-breakpoint
CREATE TABLE `purchase_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`purchase_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`location_id` text NOT NULL,
	`settlement` text NOT NULL,
	`net_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`applied_to_bill` integer DEFAULT 0 NOT NULL,
	`refunded` integer DEFAULT 0 NOT NULL,
	`to_credit` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_number_uq` ON `purchase_returns` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `purchase_returns_date_idx` ON `purchase_returns` (`business_id`,`date`);--> statement-breakpoint
CREATE INDEX `purchase_returns_purchase_idx` ON `purchase_returns` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`kind` text DEFAULT 'purchase' NOT NULL,
	`status` text NOT NULL,
	`supplier_id` text NOT NULL,
	`location_id` text NOT NULL,
	`order_date` text NOT NULL,
	`received_date` text,
	`due_date` text,
	`supplier_ref` text,
	`tax_inclusive` integer DEFAULT false NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`item_discount` integer DEFAULT 0 NOT NULL,
	`doc_discount_type` text,
	`doc_discount_value` real,
	`doc_discount` integer DEFAULT 0 NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`net_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`shipping` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`amount_due` integer DEFAULT 0 NOT NULL,
	`amount_returned` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`item_count` real DEFAULT 0 NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_number_uq` ON `purchases` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `purchases_date_idx` ON `purchases` (`business_id`,`order_date`);--> statement-breakpoint
CREATE INDEX `purchases_supplier_idx` ON `purchases` (`business_id`,`supplier_id`);--> statement-breakpoint
CREATE TABLE `quotation_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`quotation_id` text NOT NULL,
	`business_id` text NOT NULL,
	`variant_id` text,
	`name` text NOT NULL,
	`sku` text,
	`quantity` real NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`discount_type` text,
	`discount_value` real,
	`line_discount` integer DEFAULT 0 NOT NULL,
	`doc_discount` integer DEFAULT 0 NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quotation_lines_quotation_idx` ON `quotation_lines` (`quotation_id`);--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`valid_until` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`customer_id` text,
	`customer_name` text,
	`location_id` text NOT NULL,
	`tax_inclusive` integer DEFAULT true NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`doc_discount_type` text,
	`doc_discount_value` real,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`net_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`shipping` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`item_count` real DEFAULT 0 NOT NULL,
	`notes` text,
	`terms` text,
	`converted_invoice_id` text,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotations_number_uq` ON `quotations` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `quotations_date_idx` ON `quotations` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `sale_return_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`business_id` text NOT NULL,
	`invoice_line_id` text NOT NULL,
	`variant_id` text,
	`product_id` text,
	`category_id` text,
	`name` text NOT NULL,
	`sku` text,
	`quantity` real NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`net` integer DEFAULT 0 NOT NULL,
	`tax` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`restock` integer DEFAULT true NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sale_return_lines_return_idx` ON `sale_return_lines` (`return_id`);--> statement-breakpoint
CREATE INDEX `sale_return_lines_date_idx` ON `sale_return_lines` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`invoice_id` text NOT NULL,
	`customer_id` text,
	`location_id` text NOT NULL,
	`shift_id` text,
	`reason` text,
	`net_total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`cost_total` integer DEFAULT 0 NOT NULL,
	`applied_to_invoice` integer DEFAULT 0 NOT NULL,
	`refunded` integer DEFAULT 0 NOT NULL,
	`to_store_credit` integer DEFAULT 0 NOT NULL,
	`applied_to_exchange` integer DEFAULT 0 NOT NULL,
	`exchange_invoice_id` text,
	`points_reversed` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_returns_number_uq` ON `sale_returns` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `sale_returns_date_idx` ON `sale_returns` (`business_id`,`date`);--> statement-breakpoint
CREATE INDEX `sale_returns_invoice_idx` ON `sale_returns` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`business_id` text NOT NULL,
	`key` text NOT NULL,
	`prefix` text NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`padding` integer DEFAULT 5 NOT NULL,
	PRIMARY KEY(`business_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`business_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`location_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`opening_float` integer DEFAULT 0 NOT NULL,
	`expected_cash` integer,
	`counted_cash` integer,
	`difference` integer,
	`denominations` text,
	`note` text,
	`closing_note` text,
	`closed_by` text
);
--> statement-breakpoint
CREATE INDEX `shifts_business_idx` ON `shifts` (`business_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `shifts_user_idx` ON `shifts` (`business_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `stock_adjustment_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_id` text NOT NULL,
	`business_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity_before` real DEFAULT 0 NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_adjustment_lines_adj_idx` ON `stock_adjustment_lines` (`adjustment_id`);--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`location_id` text NOT NULL,
	`date` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`total_value` integer DEFAULT 0 NOT NULL,
	`line_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_adjustments_business_idx` ON `stock_adjustments` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `stock_levels` (
	`business_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`variant_id`, `location_id`)
);
--> statement-breakpoint
CREATE INDEX `stock_levels_business_idx` ON `stock_levels` (`business_id`,`location_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`reference_number` text,
	`note` text,
	`date` text NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_movements_variant_idx` ON `stock_movements` (`variant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_business_idx` ON `stock_movements` (`business_id`,`date`);--> statement-breakpoint
CREATE INDEX `stock_movements_ref_idx` ON `stock_movements` (`reference_type`,`reference_id`);--> statement-breakpoint
CREATE TABLE `stock_transfer_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`business_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_transfer_lines_transfer_idx` ON `stock_transfer_lines` (`transfer_id`);--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`number` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`total_quantity` real DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_transfers_business_idx` ON `stock_transfers` (`business_id`,`date`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`phone` text,
	`email` text,
	`address` text,
	`tax_number` text,
	`payment_terms_days` integer DEFAULT 0 NOT NULL,
	`due_balance` integer DEFAULT 0 NOT NULL,
	`credit_balance` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`total_purchased` integer DEFAULT 0 NOT NULL,
	`last_purchase_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `suppliers_business_idx` ON `suppliers` (`business_id`,`name`);--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`rate` real NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tax_rates_business_idx` ON `tax_rates` (`business_id`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`allow_decimal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `units_business_idx` ON `units` (`business_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`default_location_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_business_idx` ON `users` (`business_id`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`sku` text,
	`barcode` text,
	`price` integer DEFAULT 0 NOT NULL,
	`wholesale_price` integer,
	`cost_price` integer DEFAULT 0 NOT NULL,
	`mrp` integer,
	`reorder_level` real,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`);--> statement-breakpoint
CREATE INDEX `variants_sku_idx` ON `variants` (`business_id`,`sku`);--> statement-breakpoint
CREATE INDEX `variants_barcode_idx` ON `variants` (`business_id`,`barcode`);