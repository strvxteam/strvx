import { describe, it, expect } from "vitest";
import { detectStageAdvancementSignal } from "./detect";
import type { Classification } from "../classify/schema";

const THREAD_ID = "00000000-0000-0000-0000-000000000001";
const ENGAGEMENT_ID = "00000000-0000-0000-0000-000000000002";

function makeClassification(
  overrides: Partial<
    Pick<
      Classification,
      "category" | "intent" | "urgency" | "requires_reply" | "reasoning"
    >
  > = {}
): Pick<
  Classification,
  "category" | "intent" | "urgency" | "requires_reply" | "reasoning"
> {
  return {
    category: "other",
    intent: "other",
    urgency: "normal",
    requires_reply: false,
    reasoning: "test reasoning",
    ...overrides,
  };
}

describe("detectStageAdvancementSignal", () => {
  describe("lead -> contacted", () => {
    it("flags on lead_inquiry + requires_reply", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "lead",
        classification: makeClassification({
          category: "lead_inquiry",
          requires_reply: true,
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("contacted");
      expect(r.signals.length).toBeGreaterThan(0);
    });

    it("flags on client_active + requires_reply", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "lead",
        classification: makeClassification({
          category: "client_active",
          requires_reply: true,
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("contacted");
    });

    it("does not flag lead_inquiry without requires_reply", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "lead",
        classification: makeClassification({
          category: "lead_inquiry",
          requires_reply: false,
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });
  });

  describe("contacted -> discovery", () => {
    it("flags on intent=schedule", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "contacted",
        classification: makeClassification({
          intent: "schedule",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("discovery");
    });

    it("flags on category=scheduling_request", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "contacted",
        classification: makeClassification({
          category: "scheduling_request",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("discovery");
    });

    it("does not flag random fyi message", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "contacted",
        classification: makeClassification({ intent: "fyi" }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });
  });

  describe("discovery -> proposal", () => {
    it("flags on client_active + proposal_review (the 'commitment' substitute)", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "discovery",
        classification: makeClassification({
          category: "client_active",
          intent: "proposal_review",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("proposal");
    });

    it("does not flag on client_active without proposal_review intent", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "discovery",
        classification: makeClassification({
          category: "client_active",
          intent: "reply_needed",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });
  });

  describe("proposal -> negotiation", () => {
    it("flags when reasoning mentions pricing", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "proposal",
        classification: makeClassification({
          intent: "proposal_review",
          reasoning: "Asking for revised price on the SOW",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("negotiation");
    });

    it("flags when reasoning mentions contract terms", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "proposal",
        classification: makeClassification({
          intent: "reply_needed",
          reasoning: "Wants to discuss contract redlines",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
    });

    it("does not flag proposal-stage email about scheduling", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "proposal",
        classification: makeClassification({
          intent: "schedule",
          reasoning: "Wants to find a time to talk",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });
  });

  describe("negotiation -> build", () => {
    it("flags client_active + proposal_review", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "negotiation",
        classification: makeClassification({
          category: "client_active",
          intent: "proposal_review",
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(true);
      expect(r.suggestedStage).toBe("build");
    });
  });

  describe("no transition defined for current stage", () => {
    it("returns shouldFlag=false for build stage", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "build",
        classification: makeClassification({
          category: "client_active",
          intent: "proposal_review",
          requires_reply: true,
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
      expect(r.signals).toEqual([]);
    });

    it("returns shouldFlag=false for closed_won stage", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "closed_won",
        classification: makeClassification({
          category: "lead_inquiry",
          requires_reply: true,
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });

    it("returns shouldFlag=false for deliver stage", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "deliver",
        classification: makeClassification(),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });
  });

  describe("no-match cases", () => {
    it("vendor email on lead stage does not flag", () => {
      const r = detectStageAdvancementSignal({
        currentStage: "lead",
        classification: makeClassification({
          category: "vendor",
          requires_reply: true,
        }),
        threadId: THREAD_ID,
        engagementId: ENGAGEMENT_ID,
      });
      expect(r.shouldFlag).toBe(false);
    });

    it("newsletter does not flag at any stage", () => {
      for (const stage of ["lead", "contacted", "discovery", "proposal", "negotiation"] as const) {
        const r = detectStageAdvancementSignal({
          currentStage: stage,
          classification: makeClassification({
            category: "newsletter",
            requires_reply: false,
          }),
          threadId: THREAD_ID,
          engagementId: ENGAGEMENT_ID,
        });
        expect(r.shouldFlag).toBe(false);
      }
    });
  });
});
