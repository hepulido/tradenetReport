CREATE TABLE "change_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"gc_id" varchar,
	"co_number" text NOT NULL,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"date_submitted" date,
	"date_approved" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"invoiced_in_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "general_contractors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"payment_terms_days" numeric DEFAULT '45',
	"invoice_due_day" text,
	"billing_method" text DEFAULT 'progress',
	"retention_percent" numeric(5, 2) DEFAULT '10',
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments_received" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"project_invoice_id" varchar,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" text,
	"reference_number" text,
	"bank_deposited" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"gc_id" varchar,
	"invoice_number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"percent_billed" numeric(5, 2),
	"cumulative_percent" numeric(5, 2),
	"includes_change_orders" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" date,
	"submitted_via" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "gc_id" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "initial_proposal" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notice_to_owner" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "percent_complete" numeric(5, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_gc_id_general_contractors_id_fk" FOREIGN KEY ("gc_id") REFERENCES "public"."general_contractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_contractors" ADD CONSTRAINT "general_contractors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_project_invoice_id_project_invoices_id_fk" FOREIGN KEY ("project_invoice_id") REFERENCES "public"."project_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_gc_id_general_contractors_id_fk" FOREIGN KEY ("gc_id") REFERENCES "public"."general_contractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_gc_id_general_contractors_id_fk" FOREIGN KEY ("gc_id") REFERENCES "public"."general_contractors"("id") ON DELETE set null ON UPDATE no action;