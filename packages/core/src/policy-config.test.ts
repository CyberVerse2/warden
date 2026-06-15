import { describe, expect, it } from "vitest";
import { CELO_SEPOLIA_NETWORK } from "./types";
import { PolicyConfigSchema } from "./policy-config";

describe("PolicyConfigSchema", () => {
  it("normalizes network values from persisted config and forms", () => {
    const policy = PolicyConfigSchema.parse({
      allowedNetworks: [` ${CELO_SEPOLIA_NETWORK}\n`],
    });

    expect(policy.allowedNetworks).toEqual([CELO_SEPOLIA_NETWORK]);
  });

  it("rejects unsupported networks after normalization", () => {
    expect(() =>
      PolicyConfigSchema.parse({
        allowedNetworks: ["eip155:8453"],
      }),
    ).toThrow();
  });
});
