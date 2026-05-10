import { describe, expect, it } from "vitest";
import { AI_RISK_ANALYST_SYSTEM_PROMPT } from "./ai-risk";
import { SKILL_SEARCH_RANKER_SYSTEM_PROMPT } from "./toolset";

describe("runtime production prompts", () => {
  it("keeps the x402 risk analyst prompt grounded and non-approving", () => {
    expect(AI_RISK_ANALYST_SYSTEM_PROMPT).toContain("You do not approve payments");
    expect(AI_RISK_ANALYST_SYSTEM_PROMPT).toContain("Risk levels:");
    expect(AI_RISK_ANALYST_SYSTEM_PROMPT).toContain("high_risk");
    expect(AI_RISK_ANALYST_SYSTEM_PROMPT).toContain("flags must always be an array");
    expect(AI_RISK_ANALYST_SYSTEM_PROMPT).toContain("grounded in the payload");
  });

  it("keeps the skill ranker prompt semantic and catalog-grounded", () => {
    expect(SKILL_SEARCH_RANKER_SYSTEM_PROMPT).toContain("semantic ranking");
    expect(SKILL_SEARCH_RANKER_SYSTEM_PROMPT).toContain("direct capability fit");
    expect(SKILL_SEARCH_RANKER_SYSTEM_PROMPT).toContain("Use only FQNs from the provided catalog");
    expect(SKILL_SEARCH_RANKER_SYSTEM_PROMPT).toContain("empty matches array");
    expect(SKILL_SEARCH_RANKER_SYSTEM_PROMPT).toContain("copied exactly from the catalog");
  });
});
