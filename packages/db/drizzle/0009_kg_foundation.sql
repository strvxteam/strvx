CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"role" text NOT NULL,
	"scope_entity_types" jsonb,
	"scope_operations" jsonb,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_credentials_agent_name_unique" UNIQUE("agent_name")
);

CREATE TABLE "kg_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"label" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"scope_notes" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "kg_embeddings" (
	"node_id" text PRIMARY KEY NOT NULL,
	"model_name" text NOT NULL,
	"model_version" text NOT NULL,
	"embedding" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "kg_embeddings"
  ALTER COLUMN "embedding" TYPE vector(1536) USING embedding::vector;
CREATE INDEX "kg_embeddings_ann_idx"
  ON "kg_embeddings" USING hnsw (embedding vector_cosine_ops);

CREATE TABLE "kg_resolver_cache" (
	"node_id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"content_ref" text NOT NULL,
	"content" text,
	"content_hash" text,
	"fetched_at" timestamp with time zone NOT NULL,
	"ttl_seconds" integer NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL
);

CREATE TABLE "kg_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"tool" text NOT NULL,
	"target_node_id" text,
	"target_edge_id" text,
	"parameters" jsonb,
	"result_summary" jsonb,
	"latency_ms" integer,
	"success" boolean NOT NULL,
	"error_message" text
);

CREATE INDEX "kg_embeddings_model_idx" ON "kg_embeddings" USING btree ("model_name","model_version");
CREATE INDEX "kg_resolver_cache_source_idx" ON "kg_resolver_cache" USING btree ("source_type");
CREATE INDEX "kg_resolver_cache_stale_idx" ON "kg_resolver_cache" USING btree ("is_stale");
CREATE INDEX "kg_audit_log_occurred_idx" ON "kg_audit_log" USING btree ("occurred_at");
CREATE INDEX "kg_audit_log_actor_idx" ON "kg_audit_log" USING btree ("actor_kind","actor_id");
CREATE INDEX "kg_audit_log_target_idx" ON "kg_audit_log" USING btree ("target_node_id");
