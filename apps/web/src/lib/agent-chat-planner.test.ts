import { describe, expect, it } from "vitest";
import {
  AI_SDK_AGENT_SYSTEM_PROMPT,
  CLASSIFIER_SYSTEM_PROMPT,
  FINAL_ANSWER_SYSTEM_PROMPT,
  IntentClassificationSchema,
  SKILL_PLANNER_SYSTEM_PROMPT,
  SkillPlanSchema,
  SkillToolCallSchema,
  WARDEN_CONTROL_SKILL_FQN,
  shouldAskAiForMoreSkillWork,
  validateSkillPlan,
  type IntentClassification,
  type PlannerMcpToolCall,
} from "./agent-chat-planner";

const toolNames = new Set([
  "search_skills",
  "get_skill_endpoints",
  "warden_wallet_status",
  "warden_receipts",
  "warden_quote",
  "warden_analyze",
  "warden_fetch",
  "warden_pay",
]);

const controlClassification: IntentClassification = {
  phase: "execute",
  skillFqn: WARDEN_CONTROL_SKILL_FQN,
  intentKind: "control",
  shouldExecute: true,
  confidence: 0.95,
  reasoning: "The operator asked for built-in Warden state.",
};

describe("agent chat planner contract", () => {
  it("accepts a semantic Warden control classification", () => {
    expect(
      IntentClassificationSchema.parse(controlClassification),
    ).toMatchObject({
      skillFqn: WARDEN_CONTROL_SKILL_FQN,
      intentKind: "control",
      shouldExecute: true,
    });
  });

  it("keeps tool calls typed by tool instead of a nullable argument bag", () => {
    const plan = SkillPlanSchema.parse({
      phase: "execute",
      skillFqn: WARDEN_CONTROL_SKILL_FQN,
      selectedEndpoint: null,
      reasoning: "Use the built-in wallet status tool.",
      calls: [
        {
          tool: "warden_wallet_status",
          arguments: {
            query: null,
            limit: null,
            fqn: null,
            url: null,
            method: null,
            body: null,
            decision: null,
          },
        },
      ],
      final: null,
    });

    validateSkillPlan(plan, {
      classification: controlClassification,
      calls: [],
      availableToolNames: toolNames,
    });

    expect(plan.calls[0]?.tool).toBe("warden_wallet_status");
  });

  it("rejects Warden control tools unless the selected skill is warden/control", () => {
    const plan = SkillPlanSchema.parse({
      phase: "execute",
      skillFqn: "media.generateImage",
      selectedEndpoint: null,
      reasoning: "Wrong skill for a control tool.",
      calls: [
        {
          tool: "warden_wallet_status",
          arguments: {
            query: null,
            limit: null,
            fqn: null,
            url: null,
            method: null,
            body: null,
            decision: null,
          },
        },
      ],
      final: null,
    });

    expect(() =>
      validateSkillPlan(plan, {
        classification: controlClassification,
        calls: [],
        availableToolNames: toolNames,
      }),
    ).toThrow(/requires warden\/control/);
  });

  it("rejects endpoint inspection for FQNs not returned by AI-ranked search", () => {
    const calls: PlannerMcpToolCall[] = [
      {
        tool: "search_skills",
        arguments: { query: "text to speech" },
        result: {
          ok: true,
          data: {
            skills: [{ fqn: "dtelecom/voice" }],
          },
        },
        isError: false,
      },
    ];
    const plan = SkillPlanSchema.parse({
      phase: "inspect_endpoints",
      skillFqn: "made-up/provider",
      selectedEndpoint: null,
      reasoning: "The FQN was hallucinated.",
      calls: [
        {
          tool: "get_skill_endpoints",
          arguments: {
            query: null,
            limit: null,
            fqn: "made-up/provider",
            url: null,
            method: null,
            body: null,
            decision: null,
          },
        },
      ],
      final: null,
    });

    expect(() =>
      validateSkillPlan(plan, {
        classification: {
          phase: "inspect_endpoints",
          skillFqn: null,
          intentKind: "capability_question",
          shouldExecute: false,
          confidence: 0.9,
          reasoning: "The operator asked what is available.",
        },
        calls,
        availableToolNames: toolNames,
      }),
    ).toThrow(/not returned by skill search/);
  });

  it("rejects executable URLs with unresolved placeholders", () => {
    const plan = SkillPlanSchema.parse({
      phase: "execute",
      skillFqn: "media.generateImage",
      selectedEndpoint: "https://example.com/requests/{request_id}",
      reasoning: "The URL was not made executable.",
      calls: [
        {
          tool: "warden_fetch",
          arguments: {
            query: null,
            limit: null,
            fqn: null,
            url: "https://example.com/requests/{request_id}",
            method: "GET",
            body: null,
            decision: null,
          },
        },
      ],
      final: null,
    });

    expect(() =>
      validateSkillPlan(plan, {
        classification: {
          phase: "execute",
          skillFqn: "media.generateImage",
          intentKind: "external_execution",
          shouldExecute: true,
          confidence: 0.9,
          reasoning: "The operator asked for execution.",
        },
        calls: [],
        availableToolNames: toolNames,
      }),
    ).toThrow(/unresolved placeholder/);
  });

  it("asks the AI planner for more work after discovery and endpoint inspection when execution was requested", () => {
    const executionClassification: IntentClassification = {
      phase: "execute",
      skillFqn: null,
      intentKind: "external_execution",
      shouldExecute: true,
      confidence: 0.9,
      reasoning: "The operator asked to generate something.",
    };

    expect(
      shouldAskAiForMoreSkillWork(executionClassification, [
        {
          tool: "search_skills",
          arguments: { query: "image generation" },
          result: { ok: true, data: { skills: [{ fqn: "media.generateImage" }] } },
          isError: false,
        },
      ]),
    ).toBe(true);

    expect(
      shouldAskAiForMoreSkillWork(executionClassification, [
        {
          tool: "get_skill_endpoints",
          arguments: { fqn: "media.generateImage" },
          result: { ok: true, data: { endpoints: [] } },
          isError: false,
        },
      ]),
    ).toBe(true);
  });

  it("does not force normal questions into skill work", () => {
    const generalClassification: IntentClassification = {
      phase: "answer",
      skillFqn: null,
      intentKind: "general_question",
      shouldExecute: false,
      confidence: 0.9,
      reasoning: "The operator asked a normal conversational question.",
    };

    expect(IntentClassificationSchema.parse(generalClassification).intentKind).toBe(
      "general_question",
    );
    expect(shouldAskAiForMoreSkillWork(generalClassification, [])).toBe(false);
  });

  it("keeps oneOf out of the AI-facing plan schema while retaining typed post-parse validation", () => {
    expect(JSON.stringify(SkillPlanSchema.toJSONSchema())).not.toContain("oneOf");
    expect(JSON.stringify(SkillToolCallSchema.toJSONSchema())).toContain("oneOf");
  });

  it("keeps production prompt constraints explicit", () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain("general_question");
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain("shouldExecute true only");
    expect(SKILL_PLANNER_SYSTEM_PROMPT).toContain("Every call argument object");
    expect(SKILL_PLANNER_SYSTEM_PROMPT).toContain("Do not invent providers");
    expect(SKILL_PLANNER_SYSTEM_PROMPT).toContain("Do not resubmit");
    expect(AI_SDK_AGENT_SYSTEM_PROMPT).toContain("live/current market-price");
    expect(AI_SDK_AGENT_SYSTEM_PROMPT).toContain("Do not stop after token metadata");
    expect(FINAL_ANSWER_SYSTEM_PROMPT).toContain("MCP results prove it");
  });
});
