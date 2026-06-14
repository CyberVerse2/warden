import { describe, expect, it } from "vitest";
import { createAlchemyOperations } from "./alchemy";
import { createFishAudioOperations } from "./fish";
import { createOpenAiOperations } from "./openai";
import { createResendOperations } from "./resend";
import { createExaOperations, createTavilyOperations } from "./search";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("provider operations", () => {
  it("maps OpenAI generate text to Responses API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const [operation] = createOpenAiOperations({ apiKey: "openai-key" });
    const output = await operation!.handler(
      { prompt: "hello", model: "gpt-5.4-mini" },
      {
        operationId: operation!.id,
        fetch: async (url, init) => {
          calls.push({ url: String(url), init: init ?? {} });
          return jsonResponse({ id: "resp_1" });
        },
      },
    );

    expect(output).toEqual({ id: "resp_1" });
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer openai-key",
    });
  });

  it("maps Tavily and Exa search to their distinct auth styles", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const [tavily] = createTavilyOperations({ apiKey: "tavily-key" });
    const [exa] = createExaOperations({ apiKey: "exa-key" });
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({ results: [] });
    };

    await tavily!.handler({ query: "celo", searchDepth: "basic", maxResults: 5, includeAnswer: true }, { operationId: tavily!.id, fetch });
    await exa!.handler({ query: "celo", numResults: 10, type: "auto", includeText: true, includeHighlights: false }, { operationId: exa!.id, fetch });

    expect(calls[0]?.url).toBe("https://api.tavily.com/search");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer tavily-key",
    });
    expect(calls[1]?.url).toBe("https://api.exa.ai/search");
    expect(calls[1]?.init.headers).toMatchObject({ "x-api-key": "exa-key" });
  });

  it("maps Alchemy balances to JSON-RPC", async () => {
    const [operation] = createAlchemyOperations({ apiKey: "alchemy-key" });
    let body: unknown;
    await operation!.handler(
      {
        network: "eth-mainnet",
        address: "0x1111111111111111111111111111111111111111",
        tokens: "erc20",
      },
      {
        operationId: operation!.id,
        fetch: async (_url, init) => {
          body = JSON.parse(String(init?.body));
          return jsonResponse({ result: [] });
        },
      },
    );

    expect(body).toMatchObject({
      jsonrpc: "2.0",
      method: "alchemy_getTokenBalances",
      params: ["0x1111111111111111111111111111111111111111", "erc20"],
    });
  });

  it("maps Fish TTS to binary audio response", async () => {
    const [operation] = createFishAudioOperations({ apiKey: "fish-key" });
    const output = await operation!.handler(
      {
        text: "hello",
        referenceId: "voice-id",
        model: "s2-pro",
        format: "mp3",
        sampleRate: 44100,
      },
      {
        operationId: operation!.id,
        fetch: async (_url, init) => {
          expect(init?.headers).toMatchObject({
            authorization: "Bearer fish-key",
            model: "s2-pro",
          });
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
      },
    );

    expect(output).toEqual({
      contentType: "audio/mpeg",
      audioBase64: "AQID",
    });
  });

  it("maps Resend email to /emails", async () => {
    const [operation] = createResendOperations({ apiKey: "resend-key" });
    let url = "";
    await operation!.handler(
      {
        from: "Warden <paid@example.com>",
        to: "user@example.com",
        subject: "Paid email",
        text: "hello",
      },
      {
        operationId: operation!.id,
        fetch: async (requestUrl, init) => {
          url = String(requestUrl);
          expect(init?.headers).toMatchObject({
            authorization: "Bearer resend-key",
          });
          return jsonResponse({ id: "email_1" });
        },
      },
    );

    expect(url).toBe("https://api.resend.com/emails");
  });
});
