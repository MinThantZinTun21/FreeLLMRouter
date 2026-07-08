CREATE TABLE "model_availability_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "model_feedback" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "model_feedback" ADD COLUMN "api_key_id" text;--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD COLUMN "response_data" text;