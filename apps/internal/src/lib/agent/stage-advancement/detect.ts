/**
 * Pure heuristic that decides whether a fresh classification should *suggest*
 * advancing an engagement to the next stage. We never auto-advance — we only
 * raise a crm_hygiene_flag (kind='stage_advancement_suggested') so a human
 * confirms.
 *
 * Inputs come from agent_classifications + engagement state. Output is a
 * shape suitable for both the post-classification side effect in
 * classify.ts and the /agent/follow-ups UI.
 */
import type { Classification } from "../classify/schema";

export type StageAdvancementInput = {
  /** The fresh classification row that just landed for the inbound message. */
  classification: Pick<
    Classification,
    "category" | "intent" | "urgency" | "requires_reply" | "reasoning"
  >;
  /** Same category, denormalized onto email_threads. Currently unused but kept
   *  so callers don't have to reshape the call site if we add thread-level
   *  signals later (e.g. participant counts). */
  threadCategory?: string | null;
  /** Engagement.stage at the moment of classification. */
  currentStage:
    | "lead"
    | "contacted"
    | "discovery"
    | "building_mvp"
    | "proposal"
    | "negotiation"
    | "build"
    | "deliver"
    | "maintain"
    | "closed_won"
    | "closed_lost";
  /** For the audit trail / details JSON only. */
  threadId: string;
  engagementId: string;
};

export type StageAdvancementResult = {
  shouldFlag: boolean;
  suggestedStage?:
    | "contacted"
    | "discovery"
    | "proposal"
    | "negotiation"
    | "build";
  signals: string[];
};

/**
 * `intent='commitment'` in the spec doesn't exist in the actual `agentIntent`
 * enum. We map it to `proposal_review` — the customer reviewing/accepting a
 * proposal is the closest semantic match to "commitment". This is documented
 * here so future maintainers don't think the enum was renamed.
 */
const COMMITMENT_INTENT: Classification["intent"] = "proposal_review";

const PRICING_REGEX = /\b(price|pricing|cost|contract|terms|sow|invoice|quote)\b/i;

export function detectStageAdvancementSignal(
  input: StageAdvancementInput
): StageAdvancementResult {
  const { classification, currentStage } = input;
  const signals: string[] = [];

  switch (currentStage) {
    case "lead": {
      const isLeadCategory =
        classification.category === "lead_inquiry" ||
        classification.category === "client_active";
      if (isLeadCategory && classification.requires_reply) {
        signals.push(
          `category=${classification.category}+requires_reply=true on lead-stage engagement`
        );
        return { shouldFlag: true, suggestedStage: "contacted", signals };
      }
      return { shouldFlag: false, signals };
    }

    case "contacted": {
      // Conservative: any scheduling signal is the strongest indicator that
      // first contact landed and discovery is starting.
      const intentIsSchedule =
        classification.intent === "schedule" ||
        classification.intent === COMMITMENT_INTENT;
      const categoryIsSchedule =
        classification.category === "scheduling_request";
      if (intentIsSchedule || categoryIsSchedule) {
        if (intentIsSchedule) signals.push(`intent=${classification.intent}`);
        if (categoryIsSchedule) signals.push("category=scheduling_request");
        return { shouldFlag: true, suggestedStage: "discovery", signals };
      }
      return { shouldFlag: false, signals };
    }

    case "discovery": {
      // Spec: client_active + commitment (proposal_review) AND prior
      // proposal_sent interaction. We don't take an interaction lookup as
      // input here (keeps the helper pure); the spec also says "return
      // shouldFlag if EITHER condition is met, more conservative". We treat
      // the classification-side signal as sufficient.
      if (
        classification.category === "client_active" &&
        classification.intent === COMMITMENT_INTENT
      ) {
        signals.push("category=client_active+intent=proposal_review");
        return { shouldFlag: true, suggestedStage: "proposal", signals };
      }
      return { shouldFlag: false, signals };
    }

    case "proposal": {
      const reasoning = classification.reasoning ?? "";
      const intentMatches =
        classification.intent === "proposal_review" ||
        classification.intent === "invoice_question" ||
        classification.intent === "reply_needed";
      if (intentMatches && PRICING_REGEX.test(reasoning)) {
        signals.push(
          `intent=${classification.intent}+reasoning matched pricing/contract terms`
        );
        return { shouldFlag: true, suggestedStage: "negotiation", signals };
      }
      return { shouldFlag: false, signals };
    }

    case "negotiation": {
      if (
        classification.intent === COMMITMENT_INTENT &&
        classification.category === "client_active"
      ) {
        signals.push("category=client_active+intent=proposal_review");
        return { shouldFlag: true, suggestedStage: "build", signals };
      }
      return { shouldFlag: false, signals };
    }

    // Stages without a transition rule defined: building_mvp, build, deliver,
    // maintain, closed_won, closed_lost.
    default:
      return { shouldFlag: false, signals };
  }
}
