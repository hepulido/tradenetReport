CREATE TABLE "payroll_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"worker_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"days_worked" numeric(3, 1) NOT NULL,
	"daily_rate" numeric(8, 2) NOT NULL,
	"base_pay" numeric(10, 2) NOT NULL,
	"parking" numeric(8, 2) DEFAULT '0',
	"overtime_hours" numeric(4, 1) DEFAULT '0',
	"overtime_pay" numeric(8, 2) DEFAULT '0',
	"bonus" numeric(8, 2) DEFAULT '0',
	"deductions" numeric(8, 2) DEFAULT '0',
	"deduction_notes" text,
	"total_pay" numeric(10, 2) NOT NULL,
	"source" text DEFAULT 'manual',
	"source_ref" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"name" text NOT NULL,
	"daily_rate" numeric(8, 2),
	"role" text,
	"phone" text,
	"email" text,
	"worker_type" text DEFAULT 'employee',
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_orders" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD COLUMN "billing_type" text DEFAULT 'progress';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "poc_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "poc_phone" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "poc_email" text;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;