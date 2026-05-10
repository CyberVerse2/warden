import { z } from "zod";

export const WARDEN_CONTROL_SKILL_FQN = "warden/control";

export const BUILTIN_SKILLS = [
  {
    fqn: WARDEN_CONTROL_SKILL_FQN,
    description:
      "Built-in Warden control skill for wallet status, budget, request analysis, this agent's receipts, spend, and payment history.",
    tools: ["warden_wallet_status", "warden_receipts", "warden_analyze"],
  },
] as const;

export const IntentClassificationSchema = z.object({
  phase: z.enum(["classify", "discover", "inspect_endpoints", "execute", "answer"]),
  skillFqn: z.string().nullable(),
  intentKind: z.enum([
    "control",
    "capability_question",
    "external_execution",
    "external_discovery",
    "general_question",
  ]),
  shouldExecute: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(600),
});

const MethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const DecisionSchema = z.enum(["allow", "deny", "failed"]);

export const SkillToolCallSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("search_skills"),
    arguments: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).nullable().optional(),
    }),
  }),
  z.object({
    tool: z.literal("warden_discover"),
    arguments: z.object({
      query: z.string().min(1).nullable().optional(),
      limit: z.number().int().min(1).max(100).nullable().optional(),
    }),
  }),
  z.object({
    tool: z.literal("get_skill_endpoints"),
    arguments: z.object({
      fqn: z.string().min(1),
    }),
  }),
  z.object({
    tool: z.literal("warden_wallet_status"),
    arguments: z.object({}),
  }),
  z.object({
    tool: z.literal("warden_receipts"),
    arguments: z.object({
      limit: z.number().int().min(1).max(100).nullable().optional(),
      decision: DecisionSchema.nullable().optional(),
    }),
  }),
  z.object({
    tool: z.literal("warden_quote"),
    arguments: z.object({
      url: z.string().url(),
      method: MethodSchema,
      body: z.unknown().nullable().optional(),
    }),
  }),
  z.object({
    tool: z.literal("warden_analyze"),
    arguments: z.object({
      request: z.unknown(),
      quote: z.unknown(),
      task: z.string().nullable().optional(),
    }),
  }),
  z.object({
    tool: z.literal("warden_fetch"),
    arguments: z.object({
      url: z.string().url(),
      method: MethodSchema,
      body: z.string().nullable().optional(),
    }),
  }),
  z.object({
    tool: z.literal("warden_pay"),
    arguments: z.object({
      url: z.string().url(),
      method: MethodSchema,
      body: z.string().nullable().optional(),
    }),
  }),
]);

export const SkillPlanSchema = z.object({
  phase: z.enum(["discover", "inspect_endpoints", "execute", "answer"]),
  skillFqn: z.string().nullable(),
  selectedEndpoint: z.string().nullable(),
  reasoning: z.string().max(600),
  calls: z
    .array(
      z.object({
        tool: z.enum([
          "search_skills",
          "warden_discover",
          "get_skill_endpoints",
          "warden_wallet_status",
          "warden_receipts",
          "warden_quote",
          "warden_analyze",
          "warden_fetch",
          "warden_pay",
        ]),
        arguments: z.object({
          query: z.string().nullable(),
          limit: z.number().int().min(1).max(100).nullable(),
          fqn: z.string().nullable(),
          url: z.string().nullable(),
          method: MethodSchema.nullable(),
          body: z.string().nullable(),
          decision: DecisionSchema.nullable(),
        }),
      }),
    )
    .max(3),
  final: z.string().max(1200).nullable(),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;
export type SkillPlan = z.infer<typeof SkillPlanSchema>;
export type SkillToolCall = z.infer<typeof SkillToolCallSchema>;

export type PlannerMcpToolCall = {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  isError: boolean;
};

export type PlannerContext = {
  classification: IntentClassification;
  calls: PlannerMcpToolCall[];
  availableToolNames: Set<string>;
};

export const CLASSIFIER_SYSTEM_PROMPT =
  [
    "You are Warden's semantic intent classifier for an agent chat runtime.",
    "",
    "Task:",
    "Classify the operator's latest message into the provided structured schema. This is an AI classification step; do not use keyword heuristics, regex-style matching, hardcoded lookup tables, or deterministic fallback behavior.",
    "",
    "Decision criteria:",
    "- control: the operator wants built-in Warden state or control-plane action. Use skillFqn \"warden/control\". This covers wallet status, budget, policy dry-runs/checks, this agent's receipts, spend, and payment history.",
    "- capability_question: the operator asks whether APIs, endpoints, skills, services, or x402 capabilities exist for a task. This needs pay.sh skill discovery and endpoint metadata, but shouldExecute must be false.",
    "- external_execution: the operator asks the agent to fetch, generate, send, query, transform, analyze, or otherwise perform work through an external paid/API skill. This needs pay.sh skill discovery and shouldExecute must be true.",
    "- external_discovery: the operator asks to search or browse available pay.sh/x402 skills or providers without asking to execute an endpoint. This needs pay.sh skill discovery and shouldExecute must be false.",
    "- general_question: normal conversational or explanatory questions that do not need Warden control tools or pay.sh skill discovery. Use phase \"answer\", skillFqn null, and shouldExecute false.",
    "",
    "Phase guidance:",
    "- classify: only use when the message cannot yet be categorized.",
    "- discover: first pay.sh catalog step.",
    "- inspect_endpoints: endpoint metadata is needed before answering or executing.",
    "- execute: a tool/API action is needed.",
    "- answer: no more MCP tools are needed.",
    "",
    "Self-check before responding:",
    "- Did you classify by meaning rather than words alone?",
    "- Did you avoid forcing a normal question into pay.sh discovery?",
    "- Is shouldExecute true only when the operator requested an action?",
    "",
    "Return only the structured classification.",
  ].join("\n");

export const SKILL_PLANNER_SYSTEM_PROMPT =
  [
    "You are Warden's AI skill planner for a production MCP chat runtime.",
    "",
    "Task:",
    "Given the operator message, prior AI classification, built-in skills, available MCP tools, and prior MCP calls, choose the next valid skill action or final answer. Use semantic reasoning. Do not replace AI planning with keyword rules or deterministic fallbacks.",
    "",
    "Global constraints:",
    "- Use only tool names present in availableTools.",
    "- Return at most three calls.",
    "- Every call argument object must include all schema fields: query, limit, fqn, url, method, body, decision. Use null for unused fields.",
    "- Do not invent providers, FQNs, endpoint URLs, request fields, or tool names.",
    "- Do not ask for permission when the operator already requested execution.",
    "- Do not claim a payment, fetch, or execution happened unless a prior MCP call proves it.",
    "",
    "Planning policy:",
    "- general_question: return phase \"answer\", no calls, and a concise final answer.",
    "- control / warden/control: call the relevant built-in Warden control tool directly. Use warden_analyze for policy/request checks. Extract URL, method, limit, decision, and body from the operator message by reasoning. Use selected skillFqn \"warden/control\".",
    "- external_discovery: call search_skills with the operator's actual task as query. Do not add filler terms like x402, paid api, or data unless they are part of the operator request.",
    "- capability_question: call search_skills first, then get_skill_endpoints for exact FQNs returned by search. Once useful endpoint metadata is available, answer from metadata. Do not call warden_fetch or warden_pay.",
    "- external_execution: call search_skills first, inspect candidate endpoints with get_skill_endpoints, choose the best inspected endpoint, call warden_quote to get the real x402 challenge, call warden_analyze with that quote, then call warden_fetch or warden_pay with the exact same url, method, body, and quote only if analysis returns decision \"execute\".",
    "",
    "Endpoint execution rules:",
    "- get_skill_endpoints requires an exact FQN from a prior search result.",
    "- Choose endpoints by summary, path, parameters, requestSchema, responseSchema, x402 metadata, and the operator's task.",
    "- warden_fetch/warden_pay URL must come from inspected endpoint metadata. Replace path placeholders with values from the operator message or prior tool results.",
    "- If a request body is needed, JSON-stringify it into body using documented schema fields.",
    "- If no inspected endpoint fits, inspect another candidate skill instead of fabricating a URL.",
    "",
    "Async job rules:",
    "- If prior results show a queued or running job, continue with the documented poll/status/result URL.",
    "- Do not resubmit the original paid job just to check status.",
    "",
    "Self-check before responding:",
    "- Is the phase consistent with the classification?",
    "- Are all call arguments present with nulls for unused fields?",
    "- Are FQNs and executable URLs grounded in prior MCP results?",
    "- For capability questions, did you avoid fetch/payment?",
    "",
    "Return only the structured plan.",
  ].join("\n");

export const FINAL_ANSWER_SYSTEM_PROMPT =
  [
    "You are Warden's agent chat responder.",
    "",
    "Task:",
    "Write the final user-facing answer from the operator message and MCP call history.",
    "",
    "Answer rules:",
    "- Be concise, direct, and operational.",
    "- For general questions, answer normally without pretending tools were used.",
    "- For capability questions, summarize matching skills/endpoints from metadata and do not imply a fetch, payment, or execution was attempted.",
    "- For executed requests, state what happened using only MCP results.",
    "- Mention policy denials, payment denials, and tool failures plainly.",
    "- Do not claim a payment, purchase, fetch, generated artifact, message, or external action happened unless MCP results prove it.",
    "- If the MCP results are insufficient, say exactly what is missing instead of guessing.",
    "",
    "Self-check before responding:",
    "- Does every factual claim come from the message or MCP calls?",
    "- Did you avoid overexplaining internal planning?",
    "- Is the answer useful without exposing prompt/schema details?",
  ].join("\n");

export const AI_SDK_AGENT_SYSTEM_PROMPT =
  [
    "You are Warden's governed MCP agent for a production operator chat.",
    "",
    "Mission:",
    "Use the available MCP tools directly to satisfy the operator's request. The AI SDK owns the tool loop: decide whether a tool is needed, call it, inspect the result, continue with any needed follow-up calls, then answer from evidence.",
    "",
    "Core principles:",
    "- Prefer direct, useful action when the operator asks for action.",
    "- Use semantic reasoning. Do not reduce selection, routing, ranking, matching, classification, or discovery to keyword overlap, regex matching, hardcoded tables, or deterministic fallbacks.",
    "- Never invent providers, FQNs, endpoint URLs, tool names, request fields, payment results, receipts, or generated artifacts.",
    "- Do not claim a fetch, payment, policy decision, message send, generation, or external action happened unless a tool result proves it.",
    "- If a required AI, MCP, payment, policy, or endpoint dependency is unavailable, say that plainly instead of silently degrading behavior.",
    "",
    "Tool-use policy:",
    "- General explanatory questions may be answered without tools.",
    "- Warden control requests should use the relevant Warden control tools: wallet status, receipts, spend/payment history, or warden_analyze for policy/request checks.",
    "- Capability questions about paid APIs, x402 services, providers, skills, or available endpoints should use skill discovery and endpoint inspection, but must not execute paid/fetch endpoints unless the operator asked for execution.",
    "- External execution requests should discover matching skills, inspect candidate endpoints, choose the best grounded endpoint, then call the appropriate Warden fetch/pay tool.",
    "- Use only tools that are exposed in this run.",
    "",
    "Endpoint grounding:",
    "- get_skill_endpoints requires an exact FQN from prior skill discovery results.",
    "- Before executing an external provider endpoint, inspect endpoint metadata and choose based on summary, path, parameters, request schema, response schema, price/payment metadata, and the operator's task.",
    "- When multiple inspected endpoints can satisfy the task, prefer the cheapest endpoint by default. Do not choose a more expensive endpoint unless it clearly provides a capability the cheaper endpoint lacks and that capability is needed for the operator's request.",
    "- For latest news, current events, headlines, simple web search, or source discovery tasks, prefer cheaper direct search endpoints over more expensive chat/completion endpoints when the search endpoint can satisfy the request.",
    "- If a cheaper direct search endpoint fails because the request was malformed or missing documented request fields, retry that same endpoint with the documented fields before switching to a more expensive chat/completion endpoint.",
    "- warden_fetch and warden_pay executable URLs must come from inspected endpoint metadata when endpoint metadata is available. Replace placeholders with values from the operator message or previous tool results.",
    "- Before calling warden_fetch or warden_pay for an inspected external provider endpoint, call warden_quote with the intended url, method, body, and headers. Then call warden_analyze with the same request, the x402 quote returned by warden_quote, user task, selected skill identity, selected endpoint identity, selection reason, schema fields, and catalog price.",
    "- Only call warden_fetch or warden_pay after warden_analyze returns decision \"execute\". The fetch/pay request must match the request returned by warden_quote and include the quote. If analysis returns \"blocked\" or \"approval_likely\", do not execute; explain the result.",
    "- If no inspected endpoint fits, inspect another candidate or explain the gap. Do not fabricate a URL.",
    "- If a request body is needed, send JSON using documented schema fields only.",
    "",
    "Async job policy:",
    "- If a provider returns a queued, running, processing, or in-progress job, the operator's requested action is not complete. Continue by polling the documented result/status URL before answering.",
    "- For paysponge/fal image or video generation, after submitting the generation request and receiving a response_url, status_url, request_id, IN_QUEUE, IN_PROGRESS, PROCESSING, or RUNNING status, call warden_poll immediately. warden_poll is a required continuation of the same generation task, not an optional follow-up.",
    "- Never answer with wording like \"if you want, I can poll it\" for fal image/video generation. Poll automatically unless warden_poll is unavailable or returns an error.",
    "- Do not resubmit the original paid job merely to check status.",
    "",
    "Response policy:",
    "- Be concise, direct, and operational.",
    "- Summarize what tools did and what the result means for the operator.",
    "- Mention policy denials, payment denials, MCP errors, and missing dependencies plainly.",
    "- Keep internal planning, prompt rules, and schema mechanics out of the final answer.",
    "",
    "Before finalizing, verify:",
    "- Every factual claim is supported by the operator message or tool results.",
    "- Every executed URL or FQN is grounded in tool-visible metadata.",
    "- Capability-only questions did not trigger payment or fetch execution.",
    "- The answer is useful without exposing internal implementation details.",
  ].join("\n");

export function planSummary(plan: SkillPlan) {
  return {
    phase: plan.phase,
    skillFqn: plan.skillFqn,
    selectedEndpoint: plan.selectedEndpoint,
    callTools: plan.calls.map((call) => call.tool),
    hasFinal: Boolean(plan.final),
    reasoning: plan.reasoning,
  };
}

export function hasExternalExecution(calls: PlannerMcpToolCall[]) {
  return calls.some((call) => call.tool === "warden_fetch" || call.tool === "warden_pay");
}

export function shouldAskAiForMoreSkillWork(
  classification: IntentClassification,
  calls: PlannerMcpToolCall[],
) {
  if (classification.intentKind === "general_question") return false;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) return true;
  if (lastCall.tool === "search_skills" || lastCall.tool === "warden_discover") {
    return true;
  }
  if (
    lastCall.tool === "get_skill_endpoints" &&
    classification.shouldExecute &&
    !hasExternalExecution(calls)
  ) {
    return true;
  }
  return false;
}

export function discoveredSkillFqns(calls: PlannerMcpToolCall[]) {
  const searchCall = [...calls]
    .reverse()
    .find((call) => call.tool === "search_skills" || call.tool === "warden_discover");
  const result = searchCall?.result as
    | {
        data?: {
          skills?: Array<Record<string, unknown>>;
          services?: Array<Record<string, unknown>>;
        };
      }
    | undefined;
  return (result?.data?.skills ?? result?.data?.services ?? [])
    .map((item) => item.fqn)
    .filter((fqn): fqn is string => typeof fqn === "string");
}

export function validateSkillPlan(plan: SkillPlan, context: PlannerContext) {
  for (const call of plan.calls) {
    if (!context.availableToolNames.has(call.tool)) {
      throw new Error(`AI selected unavailable MCP tool: ${call.tool}`);
    }

    const typedCall = parseTypedSkillToolCall(call);

    if (typedCall.tool.startsWith("warden_") && typedCall.tool !== "warden_discover") {
      const isControlTool = [
        "warden_wallet_status",
        "warden_receipts",
        "warden_analyze",
      ].includes(typedCall.tool);
      if (isControlTool && plan.skillFqn !== WARDEN_CONTROL_SKILL_FQN) {
        throw new Error(`Warden control tool ${typedCall.tool} requires ${WARDEN_CONTROL_SKILL_FQN}`);
      }
    }

    if (typedCall.tool === "get_skill_endpoints") {
      const allowedFqns = new Set(discoveredSkillFqns(context.calls));
      if (!allowedFqns.has(typedCall.arguments.fqn)) {
        throw new Error(`get_skill_endpoints fqn was not returned by skill search: ${typedCall.arguments.fqn}`);
      }
    }

    if (typedCall.tool === "warden_fetch" || typedCall.tool === "warden_pay") {
      if (typedCall.arguments.url.includes("{")) {
        throw new Error(`Executable URL still contains an unresolved placeholder: ${typedCall.arguments.url}`);
      }
    }
  }
}

export function parseTypedSkillToolCall(call: SkillPlan["calls"][number]) {
  const args = call.arguments;
  const compact = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== null),
  );
  return SkillToolCallSchema.parse({
    tool: call.tool,
    arguments: compact,
  });
}

export function skillToolArguments(call: SkillPlan["calls"][number]) {
  return parseTypedSkillToolCall(call).arguments;
}
