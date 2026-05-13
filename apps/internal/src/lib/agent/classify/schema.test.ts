import { describe, it, expect } from "vitest";
import { classificationSchema, classificationJsonSchema } from "./schema";

describe("classificationSchema", () => {
  const valid = {
    category: "lead_inquiry" as const,
    urgency: "normal" as const,
    intent: "reply_needed" as const,
    requires_reply: true,
    suggested_workflow: "draft_reply" as const,
    related_engagement_id: null,
    related_engagement_confidence: null,
    related_contact_id: null,
    reasoning: "First-touch lead asking about pricing.",
  };

  it("parses a valid classification object", () => {
    const result = classificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid category", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      category: "not_a_real_category",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid urgency", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      urgency: "HIGH",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid intent", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      intent: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid workflow", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      suggested_workflow: "auto_send",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid engagement id", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      related_engagement_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid uuid engagement id with high confidence", () => {
    // RFC-4122 v4 UUID: version nibble = 4, variant bits = 8–b
    const result = classificationSchema.safeParse({
      ...valid,
      related_engagement_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      related_engagement_confidence: "high",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty reasoning", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      reasoning: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reasoning longer than 200 characters", () => {
    const result = classificationSchema.safeParse({
      ...valid,
      reasoning: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("classificationJsonSchema", () => {
  it("produces a JSON Schema with the expected enum keys", () => {
    const schema = classificationJsonSchema as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(typeof schema).toBe("object");
    // Spot-check the serialized shape — exact path depends on the zod-to-json-schema target
    const json = JSON.stringify(schema);
    expect(json).toContain("lead_inquiry");
    expect(json).toContain("scheduling_request");
    expect(json).toContain("draft_reply");
    expect(json).toContain("escalate");
  });
});
