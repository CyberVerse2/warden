# Warden Product Doc

## Summary

Warden is a programmable spend-control layer for autonomous AI agents using x402 payments on Solana.

As agents begin paying for APIs, data, compute, storage, and services through x402 endpoints, developers need a way to give agents spending ability without giving them unrestricted wallet authority. Warden creates and manages agent wallets, enforces payment policies before every spend, signs x402 payment proofs only when allowed, and records receipts for autonomous purchases.

Warden is not a replacement for x402. It sits above x402 as the policy, custody, and audit layer.

The core dependency for Warden is x402.

## Product Thesis

x402 gives agents a native way to pay for HTTP resources.

That creates a new safety problem: agents need money to operate, but private keys and unlimited balances are too dangerous to hand to autonomous systems.

Warden solves this by separating payment authority from payment execution.

An agent can request a paid API call. Warden decides whether the request is allowed, signs the x402 payment proof with a controlled wallet, forwards or returns the paid response, and stores a receipt.

The agent gets capability. The developer keeps control.

## Positioning

Warden is the spend policy layer for agentic x402 payments.

Comparable mental models:

- AWS IAM for autonomous agent wallets
- Stripe Radar for machine payments
- A policy signer for x402

Short version:

> Warden lets developers give AI agents wallets with rules.

More precise version:

> Warden is a programmable policy and custody layer that lets autonomous agents safely spend stablecoins on x402 APIs.

## Users

### Primary User

Developers building autonomous agents that need to pay for external services:

- API access
- RPC endpoints
- data providers
- model calls
- compute
- storage

### Secondary User

Teams operating multiple agents with shared spending risk:

- agent platforms
- AI devtool companies
- crypto infra teams
- research agents
- data agents
- trading or monitoring agents

## Problem

Today, an agent that needs to pay for APIs has three bad options:

1. Use a human-owned API key and billing account.
2. Hold a private key directly.
3. Share a hot wallet with broad permissions.

All three are fragile.

API keys recreate the old SaaS billing model and do not work well for autonomous machine-to-machine payments. Raw private keys are unsafe inside agent runtimes. Shared hot wallets make attribution, spend limits, and revocation painful.

x402 solves the protocol problem: how to pay for an HTTP request.

Warden solves the authority problem: whether the agent should be allowed to pay.

## Goals

- Let developers create wallets for agents.
- Enforce policy before every x402 payment.
- Prevent agents from accessing raw private keys.
- Track every spend with a structured receipt.
- Make budgets, caps, allowlists, and revocation first-class.
- Provide a web app for setup, monitoring, and policy management.
- Expose an MCP server so agents can request paid actions safely.

## Non-Goals

- Warden is not an x402 protocol replacement.
- Warden is not a general consumer wallet.
- Warden is not a full accounting system.
- Warden is not a multisig treasury product.

## Core Architecture

```text
Developer
        |
        | Web app
        v
Warden Control Plane
        |
        | creates agents, wallets, policies, approvals
        v
Warden Runtime
        ^
        |
        | MCP tool call
        |
Agent / Codex / Claude / Custom Runtime
        |
        v
Warden Runtime
        |
        | 1. Identify agent
        | 2. Parse payment target
        | 3. Fetch x402 challenge
        | 4. Check policy
        | 5. Sign payment proof
        | 6. Retry paid request
        | 7. Store receipt
        v
x402 API
        |
        | Any supported x402 endpoint
        v
Provider response
```

## Core Dependency

The core dependency for Warden is x402.

Warden should be able to call a supported x402 endpoint, parse the payment challenge, enforce policy, sign the payment proof, retry the request, and record the receipt.

## Product Surface

Warden has two MVP surfaces:

1. A web app for developers.
2. An MCP server for agents.

The web app is where developers create agents, manage wallets, configure policies, review spend, handle approvals, and inspect receipts.

The MCP server is how agents request paid actions. Agents should not use the web app and should never receive wallet keys.

## Web App

The web app should feel like a control plane for autonomous spend.

### Dashboard

The dashboard is the first screen after login. It should answer: what is happening, how much money is at risk, and which agents need attention?

Top-level metrics:

- Total agent balance
- Spend today
- Spend this week
- Blocked spend
- Pending approvals
- Active agents

Live feed:

- Research Agent spent $0.12 on Helius
- Research Agent blocked from $8.00 Unknown API
- Data Agent requested approval for $2.50 BigQuery
- Trading Agent hit hourly limit

### Agents

Agents should be a primary page in the sidebar.

The agents list should show:

- Agent name
- Wallet address
- Current balance
- Daily budget used
- Risk level
- Last activity
- Policy status

Clicking an agent opens an agent detail page.

The agent detail page should show:

- Policy
- Spend history
- Allowed providers
- Recent tool calls
- Approval history

### Approvals

Approvals should be visible from the dashboard and agent detail pages.

An approval request should show:

- agent name
- provider
- URL or resource
- amount
- token
- network
- policy rule that triggered approval
- approve/deny action

### Receipts

Receipts should be visible globally and within each agent detail page.

The receipts view should support filtering by:

- agent
- provider
- decision
- date range
- amount

## Wallet Model

Warden manages wallets as agent-controlled spending identities, not as agent-owned private keys.

Each agent wallet has:

- public key
- encrypted signing material
- network
- supported tokens
- active/revoked state
- policy bindings
- receipt history

The agent never receives the private key.

For the MVP, Warden can create custodial Solana keypairs for agents and store them encrypted at rest.

This is the fastest path to a working product.

## Policy Model

Policies decide whether Warden is allowed to sign a payment.

Policy inputs:

- agent id
- wallet id
- URL
- HTTP method
- provider
- resource path
- x402 challenge amount
- currency
- recipient
- network
- request body classification
- task/session id
- previous spend

Policy controls:

- max amount per request
- max spend per day
- allowed hosts
- allowed providers
- allowed x402 networks
- allowed tokens
- allowed API methods
- revocation

Example policy:

```json
{
  "agentId": "research-agent",
  "allowedHosts": ["x402.quicknode.com"],
  "allowedTokens": ["USDC"],
  "allowedNetworks": ["solana-mainnet"],
  "maxUsdPerRequest": "0.05",
  "maxUsdPerDay": "2.00"
}
```

## x402 Payment Flow

```text
1. Agent asks Warden to call a paid endpoint.
2. Warden sends the original HTTP request.
3. Endpoint returns HTTP 402 Payment Required.
4. Warden parses the x402 challenge.
5. Warden checks policy against the challenge.
6. If denied, Warden returns a policy error.
7. If approved, Warden signs the x402 payment proof.
8. Warden retries the original request with the payment header.
9. Endpoint verifies payment and returns the paid response.
10. Warden records a receipt.
```

The critical enforcement point is between steps 4 and 7.

Warden should never sign before it knows:

- what is being paid for
- how much it costs
- which token is used
- which network is used
- who receives payment
- which agent requested it

## MCP Server

Warden should expose an MCP server for agents.

Initial tools:

### `warden_fetch`

Fetch a paid or unpaid HTTP resource through Warden.

Warden handles x402 payment if required and allowed.

### `warden_pay`

Pay a known x402 challenge or resource.

Useful when the agent already has a payment challenge.

### `warden_policy_check`

Dry-run a payment request and return whether it would be allowed.

### `warden_receipts`

Query receipts for an agent, task, provider, or time range.

### `warden_wallet_status`

Return wallet balance, policy limits, remaining daily budget, and active state.

## Receipts

Every approved or denied payment attempt should produce a receipt.

Receipt fields:

- receipt id
- agent id
- wallet public key
- policy id
- provider
- URL
- HTTP method
- amount
- currency
- network
- recipient
- challenge hash
- request hash
- response status
- transaction signature or payment proof reference
- decision: approved, denied, failed
- decision reason
- task/session id
- created timestamp

Receipts should be queryable locally and exportable.

## MVP Scope

- Web app for developer setup and monitoring.
- Dashboard with balance, spend, blocked spend, approvals, and active agent metrics.
- Live activity feed.
- Agents page and agent detail pages.
- Create agent wallets.
- Store wallet keys encrypted at rest.
- Fund or import agent wallet.
- Define simple policies.
- Run Warden MCP server.
- Execute paid x402 HTTP requests.
- Record receipts in Postgres.
- Expose wallet balances and remaining budget.
- Provider allowlists.
- Per-request and daily caps.
- Denied-payment receipt records.
- JSON export for receipts.
- Devnet/local testing mode.

## Web App Flow

1. Developer opens Warden.
2. Developer creates an agent.
3. Warden creates or imports an agent wallet.
4. Developer funds the wallet.
5. Developer configures policy.
6. Developer connects the agent through MCP.
7. Agent spends through `warden_fetch`.
8. Developer monitors spend, blocked attempts, approvals, and receipts in the web app.

## Example Agent Flow

```text
Agent: "Fetch latest Solana account balance through QuickNode."

Agent calls:
  warden_fetch({
    url: "https://x402.quicknode.com/solana-mainnet",
    method: "POST",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: ["..."]
    }
  })

Warden:
  - identifies the agent
  - gets x402 challenge
  - sees cost is within policy
  - signs with the agent wallet
  - retries request
  - stores receipt
  - returns QuickNode response
```

## Security Requirements

- Agents must never access private keys.
- Warden must deny by default.
- Mainnet wallets must not be auto-created silently with real funds.
- Policy checks must happen after parsing the payment challenge and before signing.
- Request and challenge hashes should be stored for auditability.
- Private keys must be encrypted at rest.
- Receipt logs must be append-oriented.
- Revoked agents must not be able to spend.
- Host allowlists must be exact or carefully normalized.
- Warden should protect against redirect-based policy bypasses.

## Success Criteria

The MVP is successful if a developer can:

1. Open the web app.
2. Create an agent wallet.
3. Fund it with a small amount of USDC.
4. Define a spend policy.
5. Connect an agent through MCP.
6. Let that agent call a supported x402 API.
7. See Warden approve, sign, pay, and return the API response.
8. View dashboard activity showing the spend.
9. Open the agent detail page and see policy, spend history, recent tool calls, and receipts.

## Product Narrative

Autonomous agents are becoming economic actors. They will buy data, call APIs, rent compute, and pay other agents. x402 gives them a protocol for payment, but payment ability without policy is dangerous.

Warden gives agents spending power with boundaries.

Developers can fund agents, define what they are allowed to buy, set budgets, require approvals, and verify every purchase afterward. Agents get autonomy. Teams keep control.

Warden is the missing control plane for agentic payments.
