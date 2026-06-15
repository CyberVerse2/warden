import { CELO_MAINNET_NETWORK } from "@warden/core";
import { loadServerEnv } from "~/lib/env";
import { getOrigin } from "~/lib/origin";

export const dynamic = "force-dynamic";

const CELO_CHAIN_ID = Number(CELO_MAINNET_NETWORK.split(":")[1]); // 42220

/**
 * ERC-8004 agent card for Warden, served as the `agentURI` that the on-chain
 * Identity Registry record points to. Indexers (e.g. 8004scan) and counterpart
 * agents fetch this document to learn who Warden is and how to reach it.
 *
 * Register the resulting `https://<origin>/.well-known/agent-card.json` URL via
 * `scripts/register-erc8004-celo.ts`.
 */
export async function GET(): Promise<Response> {
  loadServerEnv();
  const origin = await getOrigin();

  const endpoints: Array<Record<string, unknown>> = [
    { type: "mcp", url: `${origin}/api/mcp` },
    { type: "a2a", url: `${origin}/.well-known/agent-card.json` },
  ];

  const wallet = process.env.WARDEN_AGENT_WALLET_ADDRESS;
  if (wallet) {
    endpoints.push({ type: "wallet", address: wallet, chainId: CELO_CHAIN_ID });
  }

  const card = {
    type: "Agent",
    name: "Warden",
    description:
      "Walleting infrastructure and MCP gateway for autonomous AI agents. " +
      "Gives an agent a stablecoin wallet to pay for real-world x402 services " +
      "while operators keep control over spending, approvals, malicious " +
      "endpoints, and audit history.",
    url: origin,
    image: `${origin}/warden-project-banner.png`,
    endpoints,
    supportedTrust: ["reputation"],
  };

  return Response.json(card, {
    headers: { "cache-control": "public, max-age=60" },
  });
}
