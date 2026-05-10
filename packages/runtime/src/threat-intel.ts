import maliciousX402s from "./malicious-x402s.json";
import type { ParsedChallenge } from "@warden/x402/challenge";

type Reputation = "blocked" | "malicious";

interface ThreatIntelEntry {
  id: string;
  reputation: Reputation;
  hosts?: string[];
  urlPrefixes?: string[];
  recipients?: string[];
  facilitators?: string[];
  networks?: string[];
  reasons: string[];
  source: string;
}

interface ThreatIntelFile {
  version: number;
  updatedAt: string;
  entries: ThreatIntelEntry[];
}

export interface ThreatIntelMatch {
  id: string;
  reputation: Reputation;
  rule: string;
  reason: string;
}

const intel = maliciousX402s as ThreatIntelFile;

export function findMaliciousX402(args: {
  url: string;
  host: string;
  challenge: ParsedChallenge;
}): ThreatIntelMatch | undefined {
  const facilitator = args.challenge.requirement.facilitator;
  for (const entry of intel.entries) {
    const request = {
      url: args.url,
      host: args.host,
      recipient: args.challenge.requirement.recipient,
      network: args.challenge.requirement.network,
      ...(facilitator !== undefined ? { facilitator } : {}),
    };
    const matchedBy = matchEntry(entry, request);
    if (!matchedBy) continue;
    return {
      id: entry.id,
      reputation: entry.reputation,
      rule: `threatIntel.${matchedBy}`,
      reason: `${entry.reputation}: ${entry.reasons.join("; ")}`,
    };
  }
  return undefined;
}

function matchEntry(
  entry: ThreatIntelEntry,
  request: {
    url: string;
    host: string;
    recipient: string;
    facilitator?: string;
    network: string;
  },
) {
  if (entry.hosts?.some((host) => host.toLowerCase() === request.host.toLowerCase())) {
    return "host";
  }
  if (entry.urlPrefixes?.some((prefix) => request.url.startsWith(prefix))) {
    return "urlPrefix";
  }
  if (entry.recipients?.includes(request.recipient)) {
    return "recipient";
  }
  if (
    request.facilitator &&
    entry.facilitators?.some(
      (facilitator) =>
        facilitator.toLowerCase() === request.facilitator?.toLowerCase(),
    )
  ) {
    return "facilitator";
  }
  if (entry.networks?.includes(request.network)) {
    return "network";
  }
  return undefined;
}
