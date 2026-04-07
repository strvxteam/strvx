import { db } from "./db";
import { sql } from "drizzle-orm";

interface StageTransitionStats {
  fromStage: string;
  toStage: string;
  count: number;
  avgDays: number;
}

interface PredictionResult {
  engagementId: string;
  currentStage: string;
  predictions: {
    nextStage: string;
    probability: number;
    avgDaysToTransition: number;
  }[];
  closeWinProbability: number;
}

export async function predictPipelineOutcome(engagementId: string, currentStage: string): Promise<PredictionResult> {
  // Get historical transition patterns
  const transitions = await db.execute(sql`
    WITH stage_pairs AS (
      SELECT
        sh1.stage::text as from_stage,
        sh2.stage::text as to_stage,
        EXTRACT(EPOCH FROM (sh2.entered_at - sh1.entered_at)) / 86400 as days_between
      FROM stage_history sh1
      JOIN stage_history sh2 ON sh1.engagement_id = sh2.engagement_id
        AND sh2.entered_at > sh1.entered_at
        AND NOT EXISTS (
          SELECT 1 FROM stage_history sh3
          WHERE sh3.engagement_id = sh1.engagement_id
            AND sh3.entered_at > sh1.entered_at
            AND sh3.entered_at < sh2.entered_at
        )
    )
    SELECT
      from_stage,
      to_stage,
      COUNT(*)::int as transition_count,
      ROUND(AVG(days_between)::numeric, 1) as avg_days
    FROM stage_pairs
    GROUP BY from_stage, to_stage
    ORDER BY from_stage, transition_count DESC
  `);

  const stats = transitions as unknown as {
    from_stage: string;
    to_stage: string;
    transition_count: number;
    avg_days: string;
  }[];

  // Filter transitions from current stage
  const fromCurrent = stats.filter((s) => s.from_stage === currentStage);
  const totalFromCurrent = fromCurrent.reduce((sum, s) => sum + s.transition_count, 0);

  const predictions = fromCurrent.map((s) => ({
    nextStage: s.to_stage,
    probability: totalFromCurrent > 0 ? Math.round((s.transition_count / totalFromCurrent) * 100) : 0,
    avgDaysToTransition: Number(s.avg_days),
  }));

  // Calculate overall close-win probability using Markov chain approximation
  // Simplified: trace the most likely path to closed_won
  let closeWinProb = 0;
  if (predictions.length > 0) {
    // Direct path to closed_won
    const directWin = predictions.find((p) => p.nextStage === "closed_won");
    if (directWin) {
      closeWinProb = directWin.probability;
    } else {
      // Estimate through most likely next stage
      const mostLikely = predictions[0];
      if (mostLikely) {
        const nextStageToWin = stats.filter((s) => s.from_stage === mostLikely.nextStage);
        const nextTotal = nextStageToWin.reduce((sum, s) => sum + s.transition_count, 0);
        const winFromNext = nextStageToWin.find((s) => s.to_stage === "closed_won");
        if (winFromNext && nextTotal > 0) {
          closeWinProb = Math.round((mostLikely.probability / 100) * (winFromNext.transition_count / nextTotal) * 100);
        } else {
          // Rough estimate based on how far along the pipeline
          const stageOrder = ["lead", "contacted", "discovery", "building_mvp", "proposal", "negotiation", "build", "deliver", "maintain"];
          const idx = stageOrder.indexOf(currentStage);
          closeWinProb = idx >= 0 ? Math.round(((idx + 1) / stageOrder.length) * 60) : 0;
        }
      }
    }
  }

  return {
    engagementId,
    currentStage,
    predictions: predictions.slice(0, 3),
    closeWinProbability: Math.min(closeWinProb, 100),
  };
}
