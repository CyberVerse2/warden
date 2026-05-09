"use client";

import { useMemo, useState } from "react";

interface AgentChatProps {
  agentId: string;
  agentName: string;
  mcpUrl: string;
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  calls?: {
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
    isError: boolean;
  }[];
}

interface ToolDescriptor {
  name: string;
  description: string;
}

const EXAMPLES = [
  "Show this agent wallet status",
  "Discover 5 x402 data services",
  "Show the last 10 receipts",
  "Dry-run policy for https://example.com",
] as const;

const DEFAULT_MESSAGE = EXAMPLES[0];

export function AgentChat({ agentId, agentName, mcpUrl }: AgentChatProps) {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      text: `Ready. Paste ${agentName}'s MCP token and ask me to inspect wallet status, discover x402 services, dry-run policy, fetch a URL, or show receipts.`,
    },
  ]);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const canSend = useMemo(
    () => token.trim().length > 0 && message.trim().length > 0 && !pending,
    [message, pending, token],
  );

  async function submit(nextMessage = message) {
    if (!token.trim() || !nextMessage.trim() || pending) return;
    setPending(true);
    setError(undefined);
    setMessages((current) => [
      ...current,
      { role: "user", text: nextMessage.trim() },
    ]);
    setMessage("");

    try {
      const res = await fetch(`/api/agent-chat/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: nextMessage.trim(), token: token.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Agent chat failed");
      setTools(body.tools ?? []);
      setMessages((current) => [
        ...current,
        {
          role: "agent",
          text: body.message,
          calls: body.calls,
        },
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setMessages((current) => [
        ...current,
        { role: "agent", text: `I could not complete the MCP call: ${msg}` },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-166px)] grid-cols-[1fr_360px] divide-x divide-hairline">
      <main className="flex min-w-0 flex-col">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="flex flex-col gap-4">
            {messages.map((item, index) => (
              <article
                key={`${item.role}-${index}`}
                className={`max-w-[780px] border p-4 ${
                  item.role === "user"
                    ? "ml-auto border-signal-dim bg-signal/[0.04]"
                    : "border-hairline-strong bg-bg-deep/30"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="label">
                    {item.role === "user" ? "Operator" : "Agent via MCP"}
                  </span>
                  {item.calls?.[0] && (
                    <span
                      className={`mono text-[10.5px] ${
                        item.calls[0].isError ? "text-deny" : "text-signal"
                      }`}
                    >
                      {item.calls[0].tool}
                    </span>
                  )}
                </div>
                <p className="text-[13.5px] leading-relaxed text-t1">{item.text}</p>
                {item.calls?.map((call) => (
                  <details
                    key={`${call.tool}-${JSON.stringify(call.arguments)}`}
                    className="group mt-4 border-t border-hairline pt-3"
                  >
                    <summary className="label flex cursor-pointer list-none items-center justify-between text-t3 hover:text-t1">
                      MCP JSON-RPC TRACE
                      <span className="mono text-[13px] text-t4 group-open:rotate-45 transition-transform">
                        +
                      </span>
                    </summary>
                    <pre className="mt-3 max-h-[360px] overflow-auto border border-hairline bg-bg-base p-3 mono text-[11px] leading-relaxed text-t2">
                      {JSON.stringify(call, null, 2)}
                    </pre>
                  </details>
                ))}
              </article>
            ))}
          </div>
        </div>

        <form
          className="border-t border-hairline bg-bg-base px-8 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && <p className="mb-3 text-[12.5px] text-deny">{error}</p>}
          <div className="mb-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setMessage(example);
                  submit(example);
                }}
                disabled={!token.trim() || pending}
                className="label border border-hairline-strong px-3 py-2 text-t3 transition-colors hover:border-signal-dim hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask the agent to call a Warden MCP tool..."
              className="min-w-0 border border-hairline-strong bg-bg-base px-4 py-3 text-[13.5px] text-t1 outline-none transition-colors placeholder:text-t4 focus:border-signal-dim"
            />
            <button
              disabled={!canSend}
              className="label border border-signal-dim px-5 py-3 text-signal transition-colors hover:border-signal hover:bg-signal hover:text-bg-base disabled:cursor-not-allowed disabled:border-hairline disabled:text-t4 disabled:hover:bg-transparent"
            >
              {pending ? "CALLING MCP" : "SEND"}
            </button>
          </div>
        </form>
      </main>

      <aside className="bg-bg-deep/25 p-6">
        <div className="border border-hairline-strong bg-bg-base p-4">
          <span className="label">MCP SERVER</span>
          <code className="mono mt-2 block break-all text-[11.5px] leading-relaxed text-t2">
            {mcpUrl}
          </code>
        </div>

        <label className="mt-5 flex flex-col gap-2">
          <span className="label">Bearer token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder="Paste the agent MCP token"
            className="border border-hairline-strong bg-bg-base px-3 py-2 mono text-[12px] text-t1 outline-none focus:border-signal-dim"
          />
        </label>

        <div className="mt-6">
          <span className="label">Exposed tools</span>
          <div className="mt-3 flex flex-col divide-y divide-hairline border border-hairline-strong">
            {tools.length === 0 ? (
              <p className="p-3 text-[12.5px] leading-relaxed text-t3">
                Tools appear after the first successful MCP handshake.
              </p>
            ) : (
              tools.map((tool) => (
                <div key={tool.name} className="p-3">
                  <code className="mono text-[11.5px] text-signal">
                    {tool.name}
                  </code>
                  <p className="mt-1 text-[12px] leading-relaxed text-t3">
                    {tool.description}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
