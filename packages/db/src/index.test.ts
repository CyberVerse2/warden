import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatMessages, createDb } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createDb", () => {
  it("accepts Postgres URLs", () => {
    expect(() =>
      createDb("postgres://postgres:postgres@localhost:5432/warden"),
    ).not.toThrow();
  });

  it("reads DATABASE_URL from the environment", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/warden",
    );

    expect(() => createDb()).not.toThrow();
  });

  it("requires a database URL", () => {
    expect(() => createDb("")).toThrow("DATABASE_URL is required");
  });

  it("exports agent chat message schema for persisted chat history", () => {
    expect(agentChatMessages.agentId.name).toBe("agent_id");
    expect(agentChatMessages.userId.name).toBe("user_id");
    expect(agentChatMessages.role.enumValues).toEqual(["user", "assistant"]);
    expect(agentChatMessages.content.name).toBe("content");
  });
});
