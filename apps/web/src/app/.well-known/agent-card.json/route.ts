import { CELO_MAINNET_NETWORK } from "@warden/core";
import { loadServerEnv } from "~/lib/env";
import { getOrigin } from "~/lib/origin";

export const dynamic = "force-dynamic";

// ERC-8004 Identity Registry (deterministic CREATE2 deployment) on Celo mainnet
// and the agentId minted for Warden via scripts/register-erc8004-celo.ts.
const AGENT_REGISTRY = `${CELO_MAINNET_NETWORK}:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`;
const AGENT_ID = Number(process.env.ERC8004_AGENT_ID ?? "9395");

// MCP protocol version Warden's gateway speaks (see api/mcp route).
const MCP_VERSION = "2025-11-25";

/**
 * ERC-8004 registration card for Warden, served as the `agentURI` the on-chain
 * Identity Registry record points to. Indexers (e.g. 8004scan) and counterpart
 * agents fetch this to learn who Warden is and how to reach it.
 *
 * Schema follows the eip-8004#registration-v1 shape used by indexed agents on
 * the registry: a `services` list plus a `registrations` backlink that ties the
 * card to its on-chain agentId + registry (indexers verify this match).
 */
export async function GET(): Promise<Response> {
  loadServerEnv();
  const origin = await getOrigin();

  // Default the agent wallet to the registry owner; override via env.
  const wallet =
    process.env.WARDEN_AGENT_WALLET_ADDRESS ??
    "0x369A41409eE50a9e6F98CcbF824673CbbBCc8716";

  const card = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Warden",
    description:
      "Walleting infrastructure and MCP gateway for autonomous AI agents. " +
      "Gives an agent a stablecoin wallet to pay for real-world x402 services " +
      "while operators keep control over spending, approvals, malicious " +
      "endpoints, and audit history. Payments settle in Celo USDC.",
    image: `${origin}/warden-project-banner.png`,
    version: "0.1.0",
    active: true,
    agent_type: "service",
    x402Support: true,
    services: [
      { name: "web", endpoint: origin },
      { name: "mcp", endpoint: `${origin}/api/mcp`, version: MCP_VERSION },
      {
        name: "a2a",
        endpoint: `${origin}/.well-known/agent-card.json`,
        version: "0.3.0",
      },
      // OASF service drives the Skills/Domains shown on agent explorers
      // (e.g. 8004scan reads oasf.skills / oasf.domains for the detail page).
      {
        name: "OASF",
        endpoint: "https://github.com/agntcy/oasf/",
        version: "v0.8.0",
        skills: [
          "tool_interaction/automation/workflow_automation",
          "tool_interaction/api_calling/rest_api",
          "natural_language_processing/analytical_and_logical_reasoning/problem_solving",
          "security/access_control/policy_enforcement",
        ],
        domains: [
          "technology/blockchain/cryptocurrency",
          "technology/blockchain/smart_contracts",
          "finance_and_business/finance",
          "finance_and_business/payments",
        ],
      },
      { name: "agentWallet", endpoint: `${CELO_MAINNET_NETWORK}:${wallet}` },
    ],
    registrations: [{ agentId: AGENT_ID, agentRegistry: AGENT_REGISTRY }],
    supportedTrust: ["reputation"],
    tags: ["x402", "payments", "agent-wallet", "mcp", "celo", "spend-control"],
  };

  return Response.json(card, {
    headers: { "cache-control": "public, max-age=60" },
  });
}
