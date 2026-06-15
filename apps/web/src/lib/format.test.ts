import { describe, expect, it } from "vitest";
import { fmtNetwork } from "./format";

describe("fmtNetwork", () => {
  it("labels supported Celo networks", () => {
    expect(fmtNetwork("eip155:42220")).toBe("Celo Mainnet");
    expect(fmtNetwork("eip155:11142220")).toBe("Celo Testnet");
  });
});
