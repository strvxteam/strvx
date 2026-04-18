CREATE TABLE "dev_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"github_owner" text NOT NULL,
	"github_repo" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"vercel_project_id" text,
	"owner_user_id" uuid,
	"color" text DEFAULT '#1a73e8' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"last_refresh_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dev_repos" ADD CONSTRAINT "dev_repos_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dev_repos_owner_repo_idx" ON "dev_repos" USING btree ("github_owner","github_repo");--> statement-breakpoint

CREATE TABLE "github_pr_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"author_login" text,
	"author_avatar_url" text,
	"head_branch" text,
	"base_branch" text,
	"html_url" text NOT NULL,
	"requested_reviewers" jsonb,
	"ci_status" text,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"created_at_remote" timestamp with time zone NOT NULL,
	"updated_at_remote" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_pr_cache" ADD CONSTRAINT "github_pr_cache_repo_id_dev_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."dev_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_pr_cache_repo_number_idx" ON "github_pr_cache" USING btree ("repo_id","number");--> statement-breakpoint
CREATE INDEX "github_pr_cache_state_idx" ON "github_pr_cache" USING btree ("state");--> statement-breakpoint

CREATE TABLE "vercel_deploy_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"deployment_id" text NOT NULL,
	"url" text NOT NULL,
	"target" text,
	"state" text NOT NULL,
	"branch" text,
	"commit_sha" text,
	"commit_message" text,
	"commit_author" text,
	"build_duration_ms" integer,
	"created_at_remote" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vercel_deploy_cache" ADD CONSTRAINT "vercel_deploy_cache_repo_id_dev_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."dev_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vercel_deploy_cache_deployment_idx" ON "vercel_deploy_cache" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "vercel_deploy_cache_repo_created_idx" ON "vercel_deploy_cache" USING btree ("repo_id","created_at_remote");--> statement-breakpoint

CREATE TABLE "github_ci_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"workflow_name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"branch" text,
	"event" text,
	"actor" text,
	"html_url" text NOT NULL,
	"duration_ms" integer,
	"created_at_remote" timestamp with time zone NOT NULL,
	"updated_at_remote" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_ci_cache" ADD CONSTRAINT "github_ci_cache_repo_id_dev_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."dev_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_ci_cache_run_idx" ON "github_ci_cache" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "github_ci_cache_repo_created_idx" ON "github_ci_cache" USING btree ("repo_id","created_at_remote");--> statement-breakpoint
CREATE INDEX "github_ci_cache_conclusion_idx" ON "github_ci_cache" USING btree ("conclusion");--> statement-breakpoint

CREATE TABLE "dependabot_alert_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"alert_number" integer NOT NULL,
	"state" text NOT NULL,
	"severity" text NOT NULL,
	"package_name" text,
	"ecosystem" text,
	"summary" text,
	"html_url" text NOT NULL,
	"created_at_remote" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dependabot_alert_cache" ADD CONSTRAINT "dependabot_alert_cache_repo_id_dev_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."dev_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dependabot_alert_cache_repo_number_idx" ON "dependabot_alert_cache" USING btree ("repo_id","alert_number");
