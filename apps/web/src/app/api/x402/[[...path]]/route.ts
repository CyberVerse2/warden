import { handleWardenX402Request } from "@warden/x402-sdk";
import { loadServerEnv } from "~/lib/env";
import { createHostedWardenX402Sdk } from "~/lib/x402-sdk";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  loadServerEnv();
  return handleWardenX402Request(createHostedWardenX402Sdk(), request, {
    basePath: "/api/x402",
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
