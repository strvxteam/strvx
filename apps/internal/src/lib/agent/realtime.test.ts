import { describe, it, expect } from "vitest";
import { AGENT_REALTIME_TABLES } from "./realtime";

/**
 * Smoke test for the agent-realtime subscription list. The
 * RealtimeProvider unions this with the CRM tables before subscribing,
 * and migration 015 publishes each of these tables on
 * supabase_realtime. Missing one here = missing live updates in the
 * inbox / proposal cards / agent-thinking indicator.
 */

describe("AGENT_REALTIME_TABLES", () => {
  it("includes scheduling_proposals so SchedulingProposalCard updates live", () => {
    expect(AGENT_REALTIME_TABLES).toContain("scheduling_proposals");
  });

  it("includes cos_runs so the agent-thinking indicator updates live", () => {
    expect(AGENT_REALTIME_TABLES).toContain("cos_runs");
  });

  it("includes the email tables driving the agent inbox", () => {
    expect(AGENT_REALTIME_TABLES).toContain("email_threads");
    expect(AGENT_REALTIME_TABLES).toContain("email_messages");
    expect(AGENT_REALTIME_TABLES).toContain("email_drafts");
  });

  it("includes the classifier + follow-up sources", () => {
    expect(AGENT_REALTIME_TABLES).toContain("agent_classifications");
    expect(AGENT_REALTIME_TABLES).toContain("follow_up_watchers");
  });

  it("contains no duplicates", () => {
    const set = new Set(AGENT_REALTIME_TABLES);
    expect(set.size).toBe(AGENT_REALTIME_TABLES.length);
  });
});
