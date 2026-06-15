import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(path: string) {
  return new NextRequest(`https://warden.example${path}`);
}

describe("proxy", () => {
  it("keeps hosted x402 SDK endpoints public", () => {
    const response = proxy(request("/api/x402/manifest"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects private pages without a Privy session", () => {
    const response = proxy(request("/agents"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://warden.example/login?next=%2Fagents",
    );
  });
});
