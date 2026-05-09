# Warden AI Risk Layer

## Purpose

Warden should stay deterministic where money moves. AI can make x402 requests easier to understand and safer to review, but it should not become the authority that signs payments.

The AI-native version of Warden is a risk and interpretation layer around the existing runtime:

```text
request -> x402 challenge -> threat intel -> deterministic policy -> AI risk annotation -> allow / hold / deny -> receipt
```

The runtime still signs only after deterministic checks pass. AI explains, classifies, summarizes, and flags risk.

Implementation entry points:

- `packages/runtime/src/malicious-x402s.json`: local malicious/blocked x402 seed list.
- `packages/runtime/src/threat-intel.ts`: deterministic hard-deny lookup.
- `packages/runtime/src/ai-risk.ts`: GPT-5.4 Mini risk analyzer using Vercel AI SDK structured output (`generateText` + `Output.object`).
- `packages/runtime/src/pipeline.ts`: runtime ordering before signing.

Runtime env:

```text
OPENAI_API_KEY=...
WARDEN_AI_RISK_MODEL=gpt-5.4-mini
```

## Threat Intel Database

Warden should maintain a database of known x402 providers and suspicious or malicious x402 endpoints. This is separate from per-agent policy. Policy says what an operator wants an agent to do. Threat intel says what Warden knows about the outside world.

### Provider Registry

Track every discovered or observed x402 service:

- host
- service URL
- network
- token
- facilitator
- advertised price range
- observed price range
- category
- first seen
- last seen
- source

### Reputation

Each provider or endpoint gets one current reputation:

```text
trusted     -> normal policy
unknown     -> normal policy, optionally with tighter caps
suspicious  -> normal policy plus risk annotation
high_risk   -> require human approval
blocked     -> hard deny
malicious   -> hard deny
```

Only `high_risk` requires human approval. That matters. If every non-trusted level interrupts the operator, Warden becomes noisy and operators stop trusting it.

`blocked` and `malicious` are not approval states. They are deterministic denial states. An operator can change the reputation record or policy later, but the payment runtime should not present a normal approve button for known-bad endpoints.

## Evidence Model

Every reputation decision should have evidence, not just a label.

Useful evidence fields:

- source: Warden observation, operator report, manual review, partner feed, automated detector
- reason: fake facilitator, excessive price, phishing host, mismatched `payTo`, replay behavior, malware payload, impossible settlement terms, domain impersonation
- confidence score
- observed request URL
- observed x402 challenge
- observed recipient
- observed facilitator
- first observed at
- last observed at
- reviewer or detector version

Receipts should store the reputation snapshot used at decision time so later reputation changes do not rewrite history.

## AI Role

AI should be used for interpretation and risk annotation:

- summarize the request in human language
- classify the provider category
- detect mismatch between endpoint claims, URL, method, body, challenge, and recipient
- flag unusual price, network, facilitator, token, or `payTo`
- explain why a request is high risk
- summarize a held approval for the operator
- suggest policy updates from receipt history

AI should not:

- sign payments
- directly override policy
- mark known malicious endpoints as safe at runtime
- be the only reason a payment is allowed

## Runtime Decision Order

The payment runtime should evaluate in this order:

```text
1. Authenticate agent token.
2. Send original request.
3. Parse x402 challenge.
4. Look up provider and endpoint reputation.
5. If reputation is malicious or blocked: deny immediately.
6. Load deterministic agent policy.
7. Evaluate deterministic policy.
8. If policy denies: deny.
9. Run AI risk annotation.
10. If reputation or AI result is high_risk: hold for human approval.
11. If policy allows and risk does not require approval: sign payment.
12. Retry request with proof.
13. Write receipt with policy decision, reputation snapshot, and AI annotation.
```

This keeps the strongest guarantees simple:

- known bad x402s never get paid
- human approval is reserved for high-risk ambiguity
- ordinary trusted or unknown traffic can still move if policy allows it
- every decision remains auditable

## Approval UX

High-risk approval should explain the request without dumping raw protocol details first.

Example:

```text
data-pipeline wants to spend $1.40 on an x402 data endpoint.

Why held:
- provider has high_risk reputation
- recipient changed from prior observations
- amount is 7x this agent's normal request size

Policy:
- host is allowed
- daily cap remaining: $3.20
- token/network match

Operator action:
- approve once
- deny
- block provider
- trust provider
```

Approving once should not change reputation. Trusting or blocking should be a separate deliberate action.

## Data Model Sketch

```text
x402_providers
  id
  host
  service_url
  category
  first_seen_at
  last_seen_at

x402_provider_observations
  id
  provider_id
  network
  token
  facilitator
  pay_to
  min_price_usd
  max_price_usd
  source
  observed_at

x402_reputation_records
  id
  provider_id
  host
  reputation
  confidence
  reason
  evidence_json
  source
  reviewed_by
  created_at
  superseded_at

receipts additions
  reputation
  reputation_reason
  risk_score
  ai_summary
  ai_flags_json
```

## Product Principle

The point is not to make Warden ask permission constantly. The point is to let normal agent spend flow while stopping known-bad endpoints and escalating only the cases that deserve human judgment.

Agents get capability. Operators keep authority. AI makes the risk legible.
