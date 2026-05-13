import { schedules, task, logger } from "./client";
import { db } from "@strvx/db";
import { generateDailyBrief } from "@/lib/agent/brief/generate";
import { reportTaskError } from "./_sentry";

/**
 * Scheduled cron: 14:00 UTC = 07:00 PT during PST (06:00 PT during PDT).
 * Daylight savings drift of one hour is acceptable for a morning brief.
 */
export const dailyBriefGenerate = schedules.task({
  id: "daily.brief.generate",
  cron: "0 14 * * *",
  run: async () => {
    try {
      const result = await generateDailyBrief({ db });
      logger.info("Generated daily brief", {
        briefId: result.briefId,
        cosRunId: result.cosRunId,
        date: result.date,
        chars: result.contentMarkdown.length,
      });
      return {
        briefId: result.briefId,
        cosRunId: result.cosRunId,
        date: result.date,
      };
    } catch (err) {
      reportTaskError("daily.brief.generate", err);
      throw err;
    }
  },
});

/**
 * On-demand trigger fired from the /agent/brief UI when today's brief is
 * missing. Same orchestration, just non-scheduled.
 */
export const dailyBriefGenerateNow = task({
  id: "daily.brief.generate.now",
  retry: { maxAttempts: 2 },
  queue: { name: "agent-brief", concurrencyLimit: 1 },
  run: async () => {
    try {
      const result = await generateDailyBrief({ db });
      logger.info("Generated daily brief (on-demand)", {
        briefId: result.briefId,
        cosRunId: result.cosRunId,
        date: result.date,
      });
      return {
        briefId: result.briefId,
        cosRunId: result.cosRunId,
        date: result.date,
      };
    } catch (err) {
      reportTaskError("daily.brief.generate.now", err);
      throw err;
    }
  },
});
