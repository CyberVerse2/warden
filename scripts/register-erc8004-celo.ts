/**
 * Register Warden as a Trustless Agent (ERC-8004) on the Celo mainnet Identity
 * Registry.
 *
 * The registry is an ERC-721: `register(agentURI)` mints an agent NFT owned by
 * the signer and emits `Registered(agentId, agentURI, owner)`. `agentURI` is a
 * public URL (or ipfs:// pointer) to the agent card JSON — serve it from
 * apps/web at /.well-known/agent-card.json.
 *
 * Usage:
 *   ERC8004_PRIVATE_KEY=0x... \
 *   ERC8004_AGENT_URI=https://your-domain/.well-known/agent-card.json \
 *   pnpm register:8004
 *
 * Optional:
 *   CELO_MAINNET_RPC_URL   RPC endpoint (default https://forno.celo.org)
 *   ERC8004_DRY_RUN=1      simulate only, do not broadcast
 */
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  getAddress,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ERC-8004 Identity Registry, deterministic CREATE2 deployment on Celo mainnet.
// Source: github.com/erc-8004/erc-8004-contracts + docs.celo.org/.../8004
const IDENTITY_REGISTRY = getAddress(
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
);

const REGISTRY_ABI = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

async function main(): Promise<void> {
  const privateKey = required("ERC8004_PRIVATE_KEY") as Hex;
  const agentURI = required("ERC8004_AGENT_URI");
  const rpcUrl = process.env.CELO_MAINNET_RPC_URL ?? "https://forno.celo.org";
  const dryRun = process.env.ERC8004_DRY_RUN === "1";

  if (!/^https?:\/\//.test(agentURI) && !agentURI.startsWith("ipfs://")) {
    throw new Error(
      `ERC8004_AGENT_URI must be an http(s) or ipfs:// URL, got: ${agentURI}`,
    );
  }

  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: celo, transport });
  const walletClient = createWalletClient({ account, chain: celo, transport });

  console.log("ERC-8004 registration (Celo mainnet)");
  console.log(`  registry:  ${IDENTITY_REGISTRY}`);
  console.log(`  signer:    ${account.address}`);
  console.log(`  agentURI:  ${agentURI}`);
  console.log(`  rpc:       ${rpcUrl}`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  balance:   ${formatEther(balance)} CELO`);
  if (balance === 0n) {
    throw new Error("Signer has 0 CELO — fund it for gas before registering.");
  }

  // Best-effort fetch of the card so we fail loudly on a typo'd URL.
  if (agentURI.startsWith("http")) {
    try {
      const res = await fetch(agentURI, { redirect: "follow" });
      if (!res.ok) {
        console.warn(
          `  ⚠ agentURI returned HTTP ${res.status}; the URL is stored on-chain regardless.`,
        );
      } else {
        await res.json();
        console.log("  agentURI:  reachable, valid JSON ✓");
      }
    } catch (err) {
      console.warn(
        `  ⚠ could not fetch agentURI (${(err as Error).message}); continuing.`,
      );
    }
  }

  const { request, result: simulatedAgentId } =
    await publicClient.simulateContract({
      account,
      address: IDENTITY_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "register",
      args: [agentURI],
    });
  console.log(`  simulate:  ok (would mint agentId ${simulatedAgentId})`);

  if (dryRun) {
    console.log("\nDRY RUN — not broadcasting.");
    return;
  }

  const hash = await walletClient.writeContract(request);
  console.log(`\n  tx sent:   ${hash}`);
  console.log(`  celoscan:  https://celoscan.io/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted (status=${receipt.status})`);
  }

  let agentId: bigint | undefined;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== IDENTITY_REGISTRY) continue;
    try {
      const decoded = decodeEventLog({
        abi: REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Registered") {
        agentId = decoded.args.agentId;
        break;
      }
    } catch {
      // not the event we want
    }
  }
  if (agentId === undefined) agentId = simulatedAgentId;

  // Read back to confirm on-chain state.
  const [storedUri, owner] = await Promise.all([
    publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    }),
    publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    }),
  ]);

  console.log("\n✅ Registered on ERC-8004 (Celo mainnet)");
  console.log(`  agentId:   ${agentId}`);
  console.log(`  owner:     ${owner}`);
  console.log(`  tokenURI:  ${storedUri}`);
  console.log(`  block:     ${receipt.blockNumber}`);
  console.log(`  gas used:  ${receipt.gasUsed}`);
  console.log(`  explorer:  https://8004scan.io/agent/42220/${agentId}`);
}

main().catch((err) => {
  console.error("\n❌ Registration failed:", (err as Error).message);
  process.exit(1);
});
