CREATE TABLE "budget_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 4),
	"unit" text,
	"unit_cost" numeric(12, 4),
	"total_cost" numeric(12, 2) NOT NULL,
	"quantity_used" numeric(12, 4) DEFAULT '0',
	"cost_to_date" numeric(12, 2) DEFAULT '0',
	"variance" numeric(12, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"product_code" text,
	"description" text NOT NULL,
	"quantity" numeric(12, 4),
	"unit" text,
	"unit_price" numeric(12, 4),
	"line_amount" numeric(12, 2),
	"category" text,
	"category_confidence" numeric(5, 2),
	"category_reason" text,
	"raw_line" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar,
	"vendor_id" varchar,
	"vendor" text,
	"invoice_number" text,
	"invoice_number_norm" text,
	"invoice_date" date,
	"due_date" date,
	"customer_po" text,
	"job_name" text,
	"subtotal" numeric(12, 2),
	"tax" numeric(12, 2),
	"shipping" numeric(12, 2),
	"total" numeric(12, 2) NOT NULL,
	"total_confidence" numeric(5, 2),
	"vendor_confidence" numeric(5, 2),
	"extraction_method" text DEFAULT 'deterministic',
	"status" text DEFAULT 'parsed_ok' NOT NULL,
	"reconciliation_delta" numeric(10, 2),
	"source_job_id" varchar,
	"source_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_phases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"sequence_order" numeric DEFAULT '1' NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"invoiced_date" date,
	"invoice_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" text,
	"reference_number" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_budgets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text DEFAULT 'Original Estimate' NOT NULL,
	"contract_value" numeric(14, 2) NOT NULL,
	"estimated_cost" numeric(14, 2),
	"estimated_profit" numeric(14, 2),
	"estimated_margin" numeric(5, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "final_categorized_result_id" varchar;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "final_parsed_result_id" varchar;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "needs_review" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "review_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "override_total" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "override_vendor_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_budget_id_project_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."project_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_phases" ADD CONSTRAINT "payment_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_phases" ADD CONSTRAINT "payment_phases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_phase_id_payment_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."payment_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;