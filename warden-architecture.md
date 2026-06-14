# Warden Architecture

## Stack

- **Language:** TypeScript end-to-end
- **Monorepo:** pnpm workspaces + Turborepo
- **Web app:** Next.js 15 (App Router), Tailwind, shadcn/ui
- **MCP server:** Node, `@modelcontextprotocol/sdk` (stdio for local, streamable HTTP for hosted)
- **Database:** Postgres via Drizzle ORM
- **Auth (web):** Auth.js with email + GitHub
- **Auth (MCP):** per-agent API tokens, hashed at rest
- **Chain:** Celo (`viem`, ERC-20 USDC)
- **x402:** Celo/EVM client (`@x402/evm` challenge proof signing + retry)
- **Crypto:** AES-256-GCM, master key from env (MVP) → KMS (later)
- **Validation:** Zod everywhere at boundaries

## Repo Layout

```
warden/
├── apps/
│   ├── web/                  Next.js control plane
│   └── mcp/                  MCP server entry
├── packages/
│   ├── core/                 domain types, errors, ids
│   ├── db/                   Drizzle schema, migrations, queries
│   ├── wallet/               Solana keypair gen, encryption, signing
│   ├── x402/                 challenge parsing, proof construction, retry
│   ├── policy/               policy evaluation engine
│   └── runtime/              orchestrates: identify → fetch → policy → sign → record
└── warden-product-doc.md
```

`packages/runtime` is the heart — both the web app's "test policy" feature and the MCP server call into it. Single source of truth for the spend pipeline.

## Data Model (Drizzle)

```
users              id, email, createdAt
agents             id, userId, name, status (active|revoked), createdAt
agent_tokens       id, agentId, tokenHash, lastUsedAt, revokedAt
wallets            id, agentId, network, publicKey, encryptedSecret, iv, status, createdAt
policies           id, agentId, version, config (jsonb), createdAt, activatedAt
receipts           id, agentId, walletId, policyId, provider, url, method,
                   amountRaw, amountUsd, currency, network, recipient,
                   challengeHash, requestHash, responseStatus,
                   txSignature, decision (allow|deny|failed), decisionReason,
                   taskId, createdAt
approvals          id, agentId, requestSnapshot (jsonb), status (pending|approved|denied),
                   triggeringRule, decidedBy, decidedAt, createdAt
spend_windows      agentId, windowKey (e.g. "day:2026-05-08"), amountUsd  -- for fast cap checks
```

Receipts are append-only by convention (no UPDATE in app code). `spend_windows` is a denormalized counter so per-day caps don't require scanning receipts on every call.

## Policy Engine

Pure function, no I/O:

```ts
type PolicyInput = {
  agent: { id: string; status: 'active' | 'revoked' };
  challenge: { amountUsd: number; recipient: string; network: string; token: string };
  request: { url: string; method: string; host: string };
  spendToDate: { dayUsd: number };
  policy: PolicyConfig;
};

type Decision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string; rule: string }
  | { kind: 'requires_approval'; reason: string; rule: string };

function evaluate(input: PolicyInput): Decision;
```

Order of checks: revocation → host allowlist → network/token allowlist → per-request cap → daily cap → approval threshold. First failure wins, deterministic.

## x402 Flow (in `runtime`)

```
1. Authenticate caller via API token → agentId, walletId
2. Send original HTTP request
3. If response is not 402, return as-is and record receipt(decision=allow, no payment)
4. Parse 402 challenge (Zod-validate the schema)
5. Hash challenge + request body
6. Load active policy + today's spend window
7. policy.evaluate(...)
   - deny → write receipt(deny), return policy error
   - requires_approval → write approval row, return pending error
   - allow → continue
8. Wallet service signs x402 payment proof (decrypts secret in-memory only)
9. Retry request with payment header
10. On success: increment spend_window, write receipt(allow, txSignature)
11. On failure post-sign: write receipt(failed) — money may have moved; surface clearly
```

Critical invariant: policy evaluation runs **after** challenge parse, **before** any signing call. Encoded as a single function in `runtime` so the order can't be reordered by accident.

## Wallet Service

```ts
createWallet(agentId, network) → { publicKey, walletId }   // generates keypair, encrypts, stores
signX402Payment(walletId, challenge, requestHash) → proof  // decrypts in-memory, signs, zeros buffer
getBalance(walletId) → { sol, usdc }                       // RPC call
revoke(walletId)
```

Private keys never leave this package. The `runtime` only ever asks for a signed proof, never for raw bytes.

Encryption: AES-256-GCM. Per-wallet key derived from master key via HKDF(master, salt=walletId). Unique IV per record. Master key from `WARDEN_MASTER_KEY` env var in MVP; KMS-backed later.

## MCP Server

`apps/mcp` exposes the five tools from the product doc. Each tool:

1. Reads `WARDEN_AGENT_TOKEN` from env (set in the agent's MCP client config)
2. Resolves agent via token hash lookup
3. Calls into `packages/runtime`
4. Returns structured result (always include `receiptId` so the agent can self-audit)

For MVP, run as stdio MCP. For hosted Warden, expose streamable HTTP MCP behind the same Next.js app.

## Web App Surfaces

| Route | Purpose |
|---|---|
| `/` | Dashboard: top metrics, live feed (SSE from `/api/events`) |
| `/agents` | List + create |
| `/agents/[id]` | Detail: policy editor, spend history, recent calls, approvals |
| `/agents/[id]/wallet` | Fund / import / view balance |
| `/approvals` | Pending approval queue, approve/deny |
| `/receipts` | Global receipts table with filters + JSON export |
| `/api/mcp` | (later) hosted MCP HTTP endpoint |
| `/api/events` | SSE feed of receipts + approvals for the live feed |

Server actions for mutations (create agent, save policy, decide approval). Drizzle queries directly from server components for reads.

## Security Boundaries

- Agent runtime ↔ MCP server: API token only; never private keys.
- MCP server ↔ runtime: in-process call with agent context.
- Runtime ↔ wallet: opaque sign call.
- Wallet ↔ DB: encrypted blob; decryption only inside the wallet package.
- Web app user session ↔ agents: ownership check on every query (agentId scoped to userId).
- Host allowlist: exact match on parsed URL host, after following at most zero redirects (fail closed on 3xx during paid retry).
- Mainnet wallet creation requires explicit confirmation flag.

## MVP Build Order

1. Monorepo skeleton + `packages/core` types + `packages/db` schema + migrations.
2. `packages/wallet` (keypair gen, encrypt, sign — unit tested).
3. `packages/x402` (challenge parse + proof construction against Solana devnet).
4. `packages/policy` (pure evaluator, table-driven tests).
5. `packages/runtime` (the pipeline, integration tests against a stub x402 server).
6. `apps/mcp` with `warden_fetch` and `warden_wallet_status` first.
7. `apps/web` minimal: auth, agents list, agent detail with policy editor, receipts.
8. Approvals flow + live feed.
9. Devnet end-to-end demo against a real x402 endpoint (e.g. QuickNode x402).

Each step ships independently and is independently testable.

## Open Questions

- Which x402 facilitator on Solana? (Affects proof format — settle in step 3 by reading the spec for the target endpoint.)
- Approvals: in-app only, or also email/Slack notification? (MVP = in-app polling banner.)
- Multi-tenant from day one, or single-org? (Schema is multi-tenant; UI defers org switcher to v2.)
