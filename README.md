# Warden

Walleting infrastructure for autonomous AI agents.

Warden gives an agent a stablecoin wallet address it can use to pay for real-world services, while operators keep control over spending, approvals, malicious endpoints, and audit history.

Agents can buy APIs, data, compute, model calls, RPC, storage, messaging, and other x402-payable resources. Warden sits in the payment path before money moves.

```txt
Agent wants Helius data for $0.12       -> Warden signs and records a receipt
Agent wants unknown API for $8.00       -> Warden blocks it
Agent wants BigQuery for $2.50          -> Warden asks for approval
Agent hits known malicious x402 target  -> Warden denies before signing
```

The agent gets capability. The operator keeps authority.

## What Warden Is

Warden is a control plane and MCP gateway for money-moving agents.

You create an agent, Warden creates a Solana wallet, and the wallet address becomes the agent's deposit address. Fund it with stablecoins, connect the agent through Warden's MCP tools, and the agent can perform paid actions without ever receiving raw private keys.

Before each x402 payment, Warden checks:

- agent status and wallet status
- allowed hosts, methods, networks, and tokens
- per-request and daily spend limits
- approval thresholds
- known malicious x402 endpoints
- optional AI risk review for suspicious requests

Every decision becomes a receipt.

## Why It Exists

Autonomous agents are starting to pay for services directly. x402 makes payment a native access mechanism for HTTP resources: request a service, receive a payment challenge, pay, and get the response.

That solves the payment protocol problem.

It does not solve the authority problem.

Agents still need:

- scoped wallet access
- spend budgets
- provider controls
- human approvals
- malicious endpoint protection
- receipts and audit trails

Warden is that missing layer.

## Product Surfaces

Warden has two main surfaces:

- **Web app:** developer control plane for agents, wallets, policies, approvals, receipts, and monitoring.
- **MCP server:** agent-facing tools for discovering payable services, checking policy, making paid requests, reading wallet status, and listing receipts.

Current MCP tools include:

- `search_skills`
- `get_skill_endpoints`
- `warden_discover`
- `warden_fetch`
- `warden_pay`
- `warden_policy_check`
- `warden_receipts`
- `warden_wallet_status`

## How It Works

```txt
Agent / Codex / Claude
        |
        | MCP tool call
        v
Warden Runtime
        |
        | 1. authenticate agent token
        | 2. call target URL
        | 3. parse x402 challenge
        | 4. check threat intel
        | 5. evaluate policy
        | 6. hold for approval if needed
        | 7. sign payment proof with agent wallet
        | 8. retry paid request
        | 9. write receipt
        v
x402 service
```

Policy evaluation happens before signing. The agent never receives the wallet private key.

## Architecture

```txt
warden/
├── apps/
│   ├── web/       Next.js control plane and hosted MCP endpoint
│   └── mcp/       stdio MCP server
├── packages/
│   ├── core/      shared types, ids, env loading, errors
│   ├── db/        Drizzle schema and database package
│   ├── policy/    deterministic policy evaluator
│   ├── runtime/   payment pipeline, MCP toolset, risk layer
│   ├── wallet/    Solana wallet creation, encryption, signing, balances
│   └── x402/      challenge parsing, proof construction, discovery, MPP
└── scripts/       smoke and maintenance scripts
```

The runtime is the critical control point. Both the web app and MCP server call into it.

## Safety Model

Warden separates payment capability from payment authority.

- Agents call tools; they do not hold private keys.
- Wallet secrets are encrypted at rest.
- Signing happens only inside the wallet service.
- Policy checks run before signing.
- Known malicious x402 targets are denied before signing.
- High-risk requests can be held for human approval.
- Receipts record allowed, denied, and failed payment attempts.

AI is used for semantic ranking and risk annotation. It is not the authority that moves money. Deterministic policy remains the control layer.

## Quickstart

Install dependencies:

```bash
pnpm install
```

Create an env file:

```bash
cp .env.example .env
```

Generate a master key:

```bash
openssl rand -base64 32
```

Set at least:

```txt
WARDEN_MASTER_KEY=...
DATABASE_URL=postgres://postgres:postgres@localhost:5432/warden
CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
WARDEN_PUBLIC_URL=http://localhost:3000
WARDEN_ALLOW_DEV_AUTH=1
```

For AI-powered skill ranking, hosted agent chat, and risk review, also set:

```txt
OPENAI_API_KEY=...
WARDEN_AI_RISK_MODEL=gpt-5.4-mini
WARDEN_AGENT_CHAT_MODEL=gpt-5.4-mini
```

Push the database schema:

```bash
pnpm db:push
```

Run the app:

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000
```

## Running the Stdio MCP Server

The web app exposes a hosted MCP endpoint at `/api/mcp/[agentId]`.

To run the standalone stdio MCP server, set:

```txt
WARDEN_AGENT_TOKEN=...
CELO_RPC_URL=...
DATABASE_URL=...
WARDEN_MASTER_KEY=...
```

Then run:

```bash
pnpm --filter @warden/mcp dev
```

The token should be created from the web app for the specific agent the MCP server represents.

## Demo Flow

1. Open the dashboard.
2. Show total balance, spend today, blocked spend, pending approvals, and live receipts.
3. Create or open an agent.
4. Show the agent wallet address as the deposit address.
5. Show policy limits and approval threshold.
6. Open agent chat.
7. Ask the agent to discover a payable x402 service.
8. Ask it to execute a paid request through Warden.
9. Open receipts and show the payment decision trail.
10. Show a blocked or approval-required request.

## Development

Run all tests:

```bash
pnpm test
```

Typecheck:

```bash
pnpm typecheck
```

Build:

```bash
pnpm build
```

Run the live workflow smoke test:

```bash
pnpm smoke:workflow
```

The smoke test can make a real paid x402 request. Use a funded disposable agent token.

## Core Positioning

Warden is for the moment when agents stop being demos and start becoming operators.

If an agent can spend money, it needs a wallet.

If it has a wallet, it needs policy.

If it has policy, it needs monitoring, malicious endpoint protection, approvals, and receipts.

That stack is Warden.
