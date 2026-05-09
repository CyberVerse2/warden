import { createDb } from "@warden/db";
import { createWardenToolset } from "@warden/runtime";
import { createWalletService } from "@warden/wallet";
import { createCoinbaseSolanaProofBuilder } from "@warden/x402";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { z } from "zod";

const AGENT_TOKEN = process.env.WARDEN_AGENT_TOKEN;
if (!AGENT_TOKEN) {
  console.error("WARDEN_AGENT_TOKEN env var is required");
  process.exit(1);
}

const RPC_URL = process.env.SOLANA_RPC_URL;
if (!RPC_URL) {
  console.error("SOLANA_RPC_URL env var is required");
  process.exit(1);
}
const FACILITATOR_URL = process.env.COINBASE_X402_FACILITATOR_URL;
if (!FACILITATOR_URL) {
  console.error("COINBASE_X402_FACILITATOR_URL env var is required");
  process.exit(1);
}

const db = createDb(process.env.DATABASE_URL);
const walletService = createWalletService({ db, rpcUrl: RPC_URL });
const proofBuilder = createCoinbaseSolanaProofBuilder(walletService, {
  rpcUrl: RPC_URL,
  facilitatorUrl: FACILITATOR_URL,
  cdpApiKeyId: process.env.CDP_API_KEY_ID,
  cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
});

const tools = createWardenToolset({
  db,
  walletService,
  proofBuilder,
  agentToken: AGENT_TOKEN,
});

const server = new McpServer({ name: "warden", version: "0.1.0" });

for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    // McpServer.tool wants the raw zod object shape, not a wrapped ZodObject.
    // Our schemas are already ZodObjects, so we pass `.shape` when present.
    "shape" in tool.inputSchema
      ? (tool.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape
      : ({} as z.ZodRawShape),
    async (args: unknown) => {
      const result = await tool.handler(args ?? {});
      return {
        isError: !result.ok,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
