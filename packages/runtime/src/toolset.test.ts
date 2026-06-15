import { describe, expect, it, vi } from "vitest";
import { createWardenToolset } from "./toolset";
import type { ToolsetDeps } from "./toolset";

describe("createWardenToolset", () => {
  it("requires an explicit public origin for hosted x402 operation endpoints", () => {
    vi.stubEnv("FAL_KEY", "fal_test");
    vi.stubEnv("WARDEN_PUBLIC_URL", "");
    vi.stubEnv("VERCEL_URL", "");

    expect(() =>
      createWardenToolset({
        db: {} as ToolsetDeps["db"],
        walletService: {} as ToolsetDeps["walletService"],
        proofBuilder: {} as ToolsetDeps["proofBuilder"],
        agentToken: "wt_test",
      }),
    ).toThrow("WARDEN_PUBLIC_URL is required");
  });

  it("uses the request public origin for hosted x402 operation endpoints", async () => {
    vi.stubEnv("FAL_KEY", "fal_test");

    const tools = createWardenToolset({
      db: {} as ToolsetDeps["db"],
      walletService: {} as ToolsetDeps["walletService"],
      proofBuilder: {} as ToolsetDeps["proofBuilder"],
      agentToken: "wt_test",
      publicOrigin: "http://localhost:3003",
    });

    const getSkillEndpoints = tools.find(
      (tool) => tool.name === "get_skill_endpoints",
    );
    expect(getSkillEndpoints).toBeDefined();

    const result = await getSkillEndpoints!.handler({
      fqn: "media.generateImage",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      skill: {
        serviceUrl: "http://localhost:3003/api/x402/media/generate-image",
        pageUrl: "http://localhost:3003/api/x402/manifest",
        operations: [
          {
            url: "http://localhost:3003/api/x402/media/generate-image",
          },
        ],
      },
      endpoints: [
        {
          url: "http://localhost:3003/api/x402/media/generate-image",
        },
      ],
    });
  });

  it("describes hosted SDK operation request schemas", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend_test");
    vi.stubEnv("RESEND_FROM", "Warden <nkiru.obi@bookings.skypadi.com>");

    const tools = createWardenToolset({
      db: {} as ToolsetDeps["db"],
      walletService: {} as ToolsetDeps["walletService"],
      proofBuilder: {} as ToolsetDeps["proofBuilder"],
      agentToken: "wt_test",
      publicOrigin: "https://warden.example",
    });

    const getSkillEndpoints = tools.find(
      (tool) => tool.name === "get_skill_endpoints",
    );

    const result = await getSkillEndpoints!.handler({
      fqn: "messaging.sendEmail",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      endpoints: [
        {
          requestSchema: {
            required: ["to", "subject"],
            properties: {
              from: { type: "string" },
              to: {
                anyOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
              },
              subject: { type: "string" },
              html: { type: "string" },
              text: { type: "string" },
            },
          },
        },
      ],
    });
  });
});
