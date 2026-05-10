CREATE TABLE "agent_response_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text,
	"receipt_id" text,
	"tool_name" text NOT NULL,
	"url" text NOT NULL,
	"method" text NOT NULL,
	"response_status" integer,
	"title" text NOT NULL,
	"operation_id" text,
	"endpoint_metadata" jsonb,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_response_artifacts" ADD CONSTRAINT "agent_response_artifacts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_response_artifacts" ADD CONSTRAINT "agent_response_artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_response_artifacts" ADD CONSTRAINT "agent_response_artifacts_message_id_agent_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_response_artifacts" ADD CONSTRAINT "agent_response_artifacts_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_response_artifacts_agent_created_idx" ON "agent_response_artifacts" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_response_artifacts_message_idx" ON "agent_response_artifacts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "agent_response_artifacts_receipt_idx" ON "agent_response_artifacts" USING btree ("receipt_id");
