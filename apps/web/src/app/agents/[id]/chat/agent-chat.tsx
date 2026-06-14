"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ResponseArtifact as StoredResponseArtifact } from "~/components/response-artifact";
import type { ResponseArtifactRow } from "~/lib/queries";

interface AgentChatProps {
  agentId: string;
  agentName: string;
  mcpUrl: string;
  initialToken?: string;
  initialMessages: ChatMessage[];
}

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  text: string;
  calls?: {
    tool: string;
    arguments: Record<string, unknown>;
    result: unknown;
    isError: boolean;
  }[];
  artifacts?: ResponseArtifactRow[];
  activity?: StreamActivity[];
}

interface StreamActivity {
  id: string;
  kind: "status" | "tool";
  label: string;
  state: "running" | "done" | "error";
  tool?: string;
  arguments?: Record<string, unknown>;
}

interface EndpointMetadata {
  url?: string;
  path?: string;
  method?: string;
  summary?: string;
  operationId?: string;
  responseSchema?: unknown;
}

interface RenderableResult {
  title: string;
  body: unknown;
  endpoint?: EndpointMetadata;
  kind?: "response" | "warden_analyze";
}

interface ToolDescriptor {
  name: string;
  description: string;
}

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "tools"; tools: ToolDescriptor[] }
  | { type: "plan"; plan: unknown }
  | {
      type: "call_start";
      tool: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "call";
      call: NonNullable<ChatMessage["calls"]>[number];
    }
  | { type: "text_delta"; delta: string }
  | { type: "message"; message: string; calls?: ChatMessage["calls"] }
  | { type: "error"; error: string }
  | { type: "done" };

const STREAM_PLACEHOLDER_TEXT = "Starting agent run...";

const EXAMPLES = [
  "what's my wallet status",
  "generate an image of girl dancing",
  "get the latest AI news",
  "find the price of CELO",
  "take a screenshot of example.com",
  "find restaurants in Lagos",
  "parse a PDF document",
  "find Instagram creators for fitness",
] as const;

const DEFAULT_MESSAGE = EXAMPLES[0];

export function AgentChat({
  agentId,
  agentName,
  mcpUrl,
  initialToken,
  initialMessages,
}: AgentChatProps) {
  const tokenStorageKey = `warden.agent-chat.token.${agentId}`;
  const [token, setToken] = useState(initialToken ?? "");
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages.length > 0
      ? initialMessages
      : [
          {
            role: "assistant",
            text: `Ready. Paste ${agentName}'s MCP token and ask me to use Warden tools, inspect wallet status, find paid APIs, fetch x402 endpoints, or show receipts.`,
          },
        ],
  );
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const latestMessageKey = messages
    .map((item) => `${item.id ?? ""}:${item.role}:${item.text.length}:${item.calls?.length ?? 0}:${item.activity?.length ?? 0}`)
    .join("|");

  useEffect(() => {
    const saved = window.sessionStorage.getItem(tokenStorageKey);
    if (!initialToken && saved) setToken(saved);
    if (initialToken) {
      window.sessionStorage.setItem(tokenStorageKey, initialToken);
      window.history.replaceState(null, "", `/agents/${agentId}/chat`);
    }
  }, [agentId, initialToken, tokenStorageKey]);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestMessageKey]);

  function updateToken(value: string) {
    setToken(value);
    if (value.trim()) {
      window.sessionStorage.setItem(tokenStorageKey, value.trim());
    } else {
      window.sessionStorage.removeItem(tokenStorageKey);
    }
  }

  const canSend = useMemo(
    () => token.trim().length > 0 && message.trim().length > 0 && !pending,
    [message, pending, token],
  );

  async function submit(nextMessage = message) {
    if (!token.trim() || !nextMessage.trim() || pending) return;
    setPending(true);
    setError(undefined);
    const assistantId = `pending-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { role: "user", text: nextMessage.trim() },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        activity: [
          {
            id: "start",
            kind: "status",
            label: STREAM_PLACEHOLDER_TEXT,
            state: "running",
          },
        ],
      },
    ]);
    setMessage("");

    try {
      const res = await fetch(`/api/agent-chat/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: nextMessage.trim(), token: token.trim() }),
      });
      if (!res.ok) {
        const raw = await res.text();
        throw new Error(raw || "Agent chat failed");
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const raw = await res.text();
        throw new Error(
          raw.includes("<!DOCTYPE")
            ? "Agent chat returned an HTML page instead of an event stream. Please refresh and sign in again."
            : raw || "Agent chat did not return an event stream",
        );
      }
      if (!res.body) throw new Error("Agent chat did not return a stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function updateAssistant(patch: Partial<ChatMessage>) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId ? { ...item, ...patch } : item,
          ),
        );
      }

      function appendActivity(activity: StreamActivity) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  activity: [...(item.activity ?? []), activity],
                }
              : item,
          ),
        );
      }

      function updateToolActivity(
        tool: string,
        patch: Partial<StreamActivity>,
      ) {
        setMessages((current) =>
          current.map((item) => {
            if (item.id !== assistantId) return item;
            const activity = item.activity ?? [];
            let updated = false;
            const nextActivity = activity.map((entry) => {
              if (!updated && entry.kind === "tool" && entry.tool === tool && entry.state === "running") {
                updated = true;
                return { ...entry, ...patch };
              }
              return entry;
            });
            return { ...item, activity: nextActivity };
          }),
        );
      }

      function appendCall(call: NonNullable<ChatMessage["calls"]>[number]) {
        setMessages((current) =>
          current.map((item) => {
            if (item.id !== assistantId) return item;
            const calls = item.calls ?? [];
            return { ...item, calls: [...calls, call] };
          }),
        );
      }

      function finishActivity(activity: StreamActivity[] | undefined) {
        return activity?.map((item) =>
          item.state === "running" ? { ...item, state: "done" as const } : item,
        );
      }

      function handleEvent(event: StreamEvent) {
        if (event.type === "status") {
          appendActivity({
            id: `status-${Date.now()}-${event.message}`,
            kind: "status",
            label: event.message,
            state: event.message.startsWith("Preparing ") ? "running" : "done",
          });
          return;
        }
        if (event.type === "tools") {
          setTools(event.tools ?? []);
          return;
        }
        if (event.type === "plan") {
          appendActivity({
            id: `plan-${Date.now()}`,
            kind: "status",
            label: "Planning MCP calls",
            state: "done",
          });
          return;
        }
        if (event.type === "call_start") {
          appendActivity({
            id: `tool-${Date.now()}-${event.tool}`,
            kind: "tool",
            label: event.tool,
            state: "running",
            tool: event.tool,
            arguments: event.arguments,
          });
          return;
        }
        if (event.type === "call") {
          updateToolActivity(event.call.tool, {
            state: event.call.isError ? "error" : "done",
            arguments: event.call.arguments,
          });
          appendCall(event.call);
          return;
        }
        if (event.type === "text_delta") {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    text: item.text + event.delta,
                  }
                : item,
            ),
          );
          return;
        }
        if (event.type === "message") {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    text: event.message,
                    calls: event.calls,
                    activity: finishActivity(item.activity),
                  }
                : item,
            ),
          );
          return;
        }
        if (event.type === "error") {
          throw new Error(event.error);
        }
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part
            .split("\n")
            .find((candidate) => candidate.startsWith("data: "));
          if (!line) continue;
          handleEvent(JSON.parse(line.slice(6)) as StreamEvent);
        }
      }
      if (buffer.trim()) {
        const line = buffer
          .split("\n")
          .find((candidate) => candidate.startsWith("data: "));
        if (line) handleEvent(JSON.parse(line.slice(6)) as StreamEvent);
      }
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? { ...item, text: `I could not complete the MCP call: ${msg}` }
            : item,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] divide-x divide-hairline overflow-hidden">
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div ref={scrollViewportRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex min-h-full flex-col gap-3">
            {messages.map((item, index) => (
              <article
                key={item.id ?? `${item.role}-${index}`}
                className={`motion-enter max-w-[760px] border p-3 ${
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
                {item.activity?.length ? (
                  <StreamActivityList activity={item.activity} />
                ) : null}
                {item.text ? <MessageText text={item.text} /> : null}
                <ResponseArtifacts
                  artifacts={item.artifacts}
                  calls={item.calls}
                  text={item.text}
                />
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
                    <pre className="mt-3 max-h-[220px] overflow-auto border border-hairline bg-bg-base p-3 mono text-[11px] leading-relaxed text-t2">
                      {JSON.stringify(call, null, 2)}
                    </pre>
                  </details>
                ))}
              </article>
            ))}
          </div>
        </div>

        <form
          className="shrink-0 border-t border-hairline bg-bg-base px-5 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error && <p className="mb-2 text-[12px] text-deny">{error}</p>}
          <div className="mb-2 grid grid-cols-4 gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setMessage(example);
                  submit(example);
                }}
                disabled={!token.trim() || pending}
                className="motion-press label truncate border border-hairline-strong px-2 py-2 text-t3 transition-colors hover:border-signal-dim hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
                title={example}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="what's my wallet status"
              className="min-w-0 border border-hairline-strong bg-bg-base px-3 py-2.5 text-[13px] text-t1 outline-none transition-colors placeholder:text-t4 focus:border-signal-dim"
            />
            <button
              disabled={!canSend}
              className="motion-press label border border-signal-dim px-4 py-2.5 text-signal transition-colors hover:border-signal hover:bg-signal hover:text-bg-base disabled:cursor-not-allowed disabled:border-hairline disabled:text-t4 disabled:hover:bg-transparent"
            >
              {pending ? "CALLING MCP" : "SEND"}
            </button>
          </div>
        </form>
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden bg-bg-deep/25 p-4">
        <div className="border border-hairline-strong bg-bg-base p-3">
          <span className="label">MCP SERVER</span>
          <code className="mono mt-2 block max-h-14 overflow-hidden break-all text-[11px] leading-relaxed text-t2">
            {mcpUrl}
          </code>
        </div>

        <label className="mt-4 flex flex-col gap-2">
          <span className="label">Bearer token</span>
          <input
            value={token}
            onChange={(event) => updateToken(event.target.value)}
            type="password"
            placeholder="Paste once, or open chat from the token page"
            className="border border-hairline-strong bg-bg-base px-3 py-2 mono text-[12px] text-t1 outline-none focus:border-signal-dim"
          />
          <span className="text-[11.5px] leading-relaxed text-t4">
            Session-only in this browser.
          </span>
        </label>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <span className="label">Exposed tools</span>
          <div className="mt-3 min-h-0 overflow-y-auto border border-hairline-strong">
            {tools.length === 0 ? (
              <p className="p-3 text-[12.5px] leading-relaxed text-t3">
                Tools appear after the first successful MCP handshake.
              </p>
            ) : (
              tools.map((tool) => (
                <div key={tool.name} className="border-b border-hairline p-3 last:border-b-0">
                  <code className="mono text-[11.5px] text-signal">
                    {tool.name}
                  </code>
                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-t3">
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

function ResponseArtifacts({
  artifacts,
  calls,
  text,
}: {
  artifacts?: ResponseArtifactRow[];
  calls?: ChatMessage["calls"];
  text?: string;
}) {
  if (artifacts?.length) {
    return (
      <div className="mt-3 space-y-3">
        {artifacts.map((artifact) => (
          <StoredResponseArtifact key={artifact.id} artifact={artifact} />
        ))}
      </div>
    );
  }

  const renderable = renderableResults(calls, text);
  if (renderable.length === 0) return null;
  return (
    <div className="mt-3 space-y-3">
      {renderable.map((artifact, index) => (
        <ResponseArtifact
          key={`${artifact.title}-${index}`}
          artifact={artifact}
        />
      ))}
    </div>
  );
}

function StreamActivityList({ activity }: { activity: StreamActivity[] }) {
  const visible = compactActivity(activity);
  if (visible.length === 0) return null;
  return (
    <div className="motion-enter mb-3 border border-hairline bg-bg-base/60">
      {visible.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-start justify-between gap-3 border-b border-hairline px-3 py-2 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  item.state === "error"
                    ? "bg-deny"
                    : item.state === "done"
                      ? "bg-signal"
                      : "bg-t4"
                } ${item.state === "running" ? "motion-status-running" : ""}`}
              />
              <span className="label truncate text-t3">
                {item.kind === "tool" ? "Tool call" : "Run step"}
              </span>
            </div>
            <p className="mt-1 truncate mono text-[11.5px] leading-relaxed text-t1">
              {item.label}
            </p>
            {item.arguments && Object.keys(item.arguments).length > 0 ? (
              <p className="mt-1 truncate mono text-[10.5px] text-t4">
                {JSON.stringify(item.arguments)}
              </p>
            ) : null}
          </div>
          <span
            className={`label shrink-0 ${
              item.state === "error"
                ? "text-deny"
                : item.state === "done"
                  ? "text-signal"
                  : "text-t4"
            }`}
          >
            {item.state === "running" ? "RUNNING" : item.state === "done" ? "DONE" : "ERROR"}
          </span>
        </div>
      ))}
    </div>
  );
}

function compactActivity(activity: StreamActivity[]) {
  const seen = new Set<string>();
  return activity.filter((item) => {
    const key = `${item.kind}:${item.label}:${item.state}`;
    if (item.kind === "status" && seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderableResults(calls?: ChatMessage["calls"], text?: string): RenderableResult[] {
  if (!calls) return [];
  const inlineMediaUrls = text ? new Set(collectMediaUrls(text, "image")) : new Set<string>();
  return calls.flatMap<RenderableResult>((call) => {
    if (!call.isError && call.tool === "warden_analyze") {
      const data = toolData(call.result);
      if (data === undefined) return [];
      return [
        {
          title: "Warden analysis",
          body: data,
          kind: "warden_analyze",
        },
      ];
    }
    if (
      call.isError ||
      (call.tool !== "warden_fetch" &&
        call.tool !== "warden_pay" &&
        call.tool !== "warden_poll")
    ) {
      return [];
    }
    const body = responseBody(call.result);
    if (body === undefined) return [];
    if (isQueuedBody(body)) return [];
    const imageUrls = collectMediaUrls(body, "image");
    if (imageUrls.length > 0 && imageUrls.every((url) => inlineMediaUrls.has(url))) {
      return [];
    }
    return [
      {
        title: endpointForCall(calls, call)?.summary ?? resultTitle(body),
        body,
        endpoint: endpointForCall(calls, call),
        kind: "response",
      },
    ];
  });
}

function isQueuedBody(body: unknown) {
  if (!isRecord(body)) return false;
  const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
  return (
    status === "IN_QUEUE" ||
    status === "IN_PROGRESS" ||
    status === "PROCESSING" ||
    status === "RUNNING" ||
    typeof body.response_url === "string" ||
    typeof body.status_url === "string" ||
    typeof body.poll_url === "string"
  );
}

function responseBody(result: unknown) {
  const data = toolData(result);
  if (!isRecord(data)) return undefined;
  if (isRecord(data.result)) return responseBody({ data: data.result });
  const response = data.response;
  if (!isRecord(response)) return undefined;
  return response.body;
}

function toolData(result: unknown) {
  if (!isRecord(result)) return undefined;
  return result.data;
}

function endpointForCall(
  calls: NonNullable<ChatMessage["calls"]>,
  fetchCall: NonNullable<ChatMessage["calls"]>[number],
) {
  const url = typeof fetchCall.arguments.url === "string" ? fetchCall.arguments.url : "";
  if (!url) return undefined;
  for (const call of calls) {
    if (call.tool !== "get_skill_endpoints" || !isRecord(call.result)) continue;
    const data = call.result.data;
    if (!isRecord(data) || !Array.isArray(data.endpoints)) continue;
    const endpoint = data.endpoints.find((candidate): candidate is EndpointMetadata => {
      if (!isRecord(candidate)) return false;
      const endpointUrl = typeof candidate.url === "string" ? candidate.url : "";
      return endpointUrl === url || templateMatches(endpointUrl, url);
    });
    if (endpoint) return endpoint;
  }
  return undefined;
}

function templateMatches(template: string, url: string) {
  if (!template.includes("{")) return false;
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{[^}]+\\\}/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(url);
}

function ResponseArtifact({ artifact }: { artifact: RenderableResult }) {
  if (artifact.kind === "warden_analyze") {
    return <WardenAnalyzeArtifact body={artifact.body} />;
  }
  const imageUrls = collectMediaUrls(artifact.body, "image");
  const videoUrls = collectMediaUrls(artifact.body, "video");
  const audioSources = collectAudioSources(artifact.body);
  const text = textResult(artifact.body);
  const html = text && looksLikeHtml(text) ? summarizeHtml(text) : undefined;
  return (
    <div className="motion-panel motion-enter border border-hairline-strong bg-bg-base/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label">{artifact.title}</span>
        {artifact.endpoint?.operationId && (
          <code className="mono text-[10.5px] text-t4">
            {artifact.endpoint.operationId}
          </code>
        )}
      </div>
      {imageUrls.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {imageUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden border border-hairline bg-bg-deep"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Generated x402 result"
                className="max-h-[320px] w-full object-contain"
              />
            </a>
          ))}
        </div>
      )}
      {videoUrls.length > 0 && (
        <div className="space-y-2">
          {videoUrls.map((url) => (
            <video
              key={url}
              src={url}
              controls
              className="max-h-[320px] w-full border border-hairline bg-bg-deep"
            />
          ))}
        </div>
      )}
      {audioSources.length > 0 && (
        <div className="space-y-2">
          {audioSources.map((source) => (
            <div
              key={source.src}
              className="border border-hairline bg-bg-deep p-3"
            >
              <p className="label text-t4">Voice note</p>
              <audio src={source.src} controls className="mt-3 w-full" />
            </div>
          ))}
        </div>
      )}
      {html && (
        <div className="border border-hairline bg-bg-deep p-3">
          <p className="label text-t4">HTML response truncated</p>
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-t2">
            {html}
          </p>
        </div>
      )}
      {text && !html && audioSources.length === 0 && (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-t2">
          {truncateText(text)}
        </p>
      )}
      {imageUrls.length === 0 && videoUrls.length === 0 && audioSources.length === 0 && !text && (
        <pre className="max-h-[260px] overflow-auto border border-hairline bg-bg-deep p-3 mono text-[11px] leading-relaxed text-t2">
          {truncateText(JSON.stringify(artifact.body, null, 2))}
        </pre>
      )}
    </div>
  );
}

function WardenAnalyzeArtifact({ body }: { body: unknown }) {
  const data = isRecord(body) ? body : {};
  const decision = stringValue(data.decision) ?? "unknown";
  const risk = isRecord(data.risk) ? data.risk : undefined;
  const threat = isRecord(data.threat) ? data.threat : undefined;
  const policyPreview = isRecord(data.policyPreview) ? data.policyPreview : undefined;
  const x402 = isRecord(data.x402) ? data.x402 : undefined;
  const context = isRecord(data.context) ? data.context : undefined;
  const endpoint = isRecord(context?.selectedEndpoint) ? context?.selectedEndpoint : undefined;
  const skill = isRecord(context?.selectedSkill) ? context?.selectedSkill : undefined;
  const schemaFit = isRecord(context?.schemaFit) ? context?.schemaFit : undefined;
  const priceCheck = isRecord(context?.priceCheck) ? context?.priceCheck : undefined;
  const policyDecision = isRecord(policyPreview?.decision)
    ? stringValue(policyPreview?.decision.kind)
    : undefined;
  const flags = Array.isArray(risk?.flags)
    ? risk.flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  const missingFields = Array.isArray(schemaFit?.missingRequiredFields)
    ? schemaFit.missingRequiredFields.filter((field): field is string => typeof field === "string")
    : [];
  const unknownFields = Array.isArray(schemaFit?.unknownBodyFields)
    ? schemaFit.unknownBodyFields.filter((field): field is string => typeof field === "string")
    : [];

  return (
    <div className={`motion-panel motion-enter border p-3 ${analysisTone(decision)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="label">Warden analyze</span>
          <p className="mt-1 text-[13px] leading-relaxed text-t1">
            {stringValue(data.rationale) ?? stringValue(risk?.summary) ?? "Request analyzed."}
          </p>
        </div>
        <span className={`label border px-2 py-1 ${decisionBadgeTone(decision)}`}>
          {decisionLabel(decision)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label="AI risk" value={stringValue(risk?.level) ?? "unknown"} />
        <Metric label="Policy" value={policyDecision ?? "unknown"} />
        <Metric label="x402 price" value={usdValue(x402?.amountUsd) ?? "unknown"} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <InfoBlock
          label="Selected endpoint"
          primary={stringValue(endpoint?.summary) ?? stringValue(endpoint?.operationId) ?? "Unknown endpoint"}
          secondary={[
            stringValue(skill?.fqn),
            [stringValue(endpoint?.method), stringValue(endpoint?.url)].filter(Boolean).join(" "),
          ].filter(isString)}
        />
        <InfoBlock
          label="Payment challenge"
          primary={stringValue(x402?.recipient) ?? "Unknown recipient"}
          secondary={[
            [stringValue(x402?.network), stringValue(x402?.token)].filter(Boolean).join(" / "),
            stringValue(x402?.challengeHash) ? `challenge ${stringValue(x402?.challengeHash)}` : undefined,
          ].filter(isString)}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <InfoBlock
          label="Schema fit"
          primary={
            schemaFit?.requiredFieldsSatisfied === true
              ? "Required fields satisfied"
              : missingFields.length > 0
                ? `Missing: ${missingFields.join(", ")}`
                : "Unknown"
          }
          secondary={unknownFields.length > 0 ? [`Unknown fields: ${unknownFields.join(", ")}`] : []}
        />
        <InfoBlock
          label="Price check"
          primary={
            priceCheck?.matchesCatalogPrice === true
              ? "Catalog price matches challenge"
              : priceCheck?.matchesCatalogPrice === false
                ? "Catalog price differs from challenge"
                : "No catalog comparison"
          }
          secondary={[
            stringValue(priceCheck?.catalogPrice) ? `catalog ${stringValue(priceCheck?.catalogPrice)}` : undefined,
            usdValue(priceCheck?.challengeAmountUsd)
              ? `challenge ${usdValue(priceCheck?.challengeAmountUsd)}`
              : undefined,
          ].filter(isString)}
        />
      </div>

      {threat ? (
        <div className="mt-3 border border-deny/50 bg-deny/[0.06] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="label text-deny">Threat intel match</span>
            <code className="mono text-[10.5px] text-deny">
              {stringValue(threat.rule) ?? "threatIntel"}
            </code>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-t2">
            {stringValue(threat.reason) ?? "Known malicious x402 match."}
          </p>
        </div>
      ) : null}

      {flags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {flags.map((flag) => (
            <span key={flag} className="mono border border-hairline bg-bg-deep px-2 py-1 text-[10.5px] text-t3">
              {flag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline bg-bg-deep p-3">
      <p className="label text-t4">{label}</p>
      <p className="mt-1 truncate mono text-[12px] text-t1">{value}</p>
    </div>
  );
}

function InfoBlock({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string[];
}) {
  return (
    <div className="min-w-0 border border-hairline bg-bg-base/60 p-3">
      <p className="label text-t4">{label}</p>
      <p className="mt-1 break-words text-[12.5px] leading-relaxed text-t1">
        {primary}
      </p>
      {secondary?.length ? (
        <div className="mt-2 space-y-1">
          {secondary.map((line) => (
            <p key={line} className="break-all mono text-[10.5px] leading-relaxed text-t4">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const imageUrls = collectMediaUrls(text, "image");
  const videoUrls = collectMediaUrls(text, "video");
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-t1">
        {text}
      </p>
      {imageUrls.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {imageUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden border border-hairline bg-bg-deep"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Generated image"
                className="max-h-[360px] w-full object-contain"
              />
            </a>
          ))}
        </div>
      )}
      {videoUrls.length > 0 && (
        <div className="space-y-2">
          {videoUrls.map((url) => (
            <video
              key={url}
              src={url}
              controls
              className="max-h-[360px] w-full border border-hairline bg-bg-deep"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function resultTitle(body: unknown) {
  if (collectMediaUrls(body, "image").length > 0) return "Image result";
  if (collectMediaUrls(body, "video").length > 0) return "Video result";
  if (collectAudioSources(body).length > 0) return "Voice note";
  if (textResult(body)) return "Text result";
  return "x402 response";
}

function decisionLabel(decision: string) {
  if (decision === "execute") return "EXECUTE";
  if (decision === "blocked") return "BLOCKED";
  if (decision === "approval_likely") return "APPROVAL LIKELY";
  return decision.toUpperCase();
}

function analysisTone(decision: string) {
  if (decision === "blocked") return "border-deny/60 bg-deny/[0.04]";
  if (decision === "approval_likely") return "border-pending/60 bg-pending/[0.04]";
  if (decision === "execute") return "border-signal-dim bg-signal/[0.04]";
  return "border-hairline-strong bg-bg-base/70";
}

function decisionBadgeTone(decision: string) {
  if (decision === "blocked") return "border-deny/60 text-deny";
  if (decision === "approval_likely") return "border-pending/60 text-pending";
  if (decision === "execute") return "border-signal-dim text-signal";
  return "border-hairline text-t3";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function usdValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(value < 0.01 ? 4 : 2)}`
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function collectMediaUrls(value: unknown, kind: "image" | "video") {
  const urls = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      for (const url of urlsFromText(item)) {
        if (isMediaUrl(url, kind)) urls.add(url);
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!isRecord(item)) return;
    const url = typeof item.url === "string" ? item.url : undefined;
    const contentType =
      typeof item.content_type === "string"
        ? item.content_type
        : typeof item.contentType === "string"
          ? item.contentType
          : undefined;
    if (url && (matchesContentType(contentType, kind) || isMediaUrl(url, kind))) {
      urls.add(url);
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
  return [...urls];
}

function urlsFromText(value: string) {
  const matches = value.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return matches.map((url) => url.replace(/[.,;:!?]+$/g, ""));
}

function collectAudioSources(value: unknown) {
  const sources = new Map<string, { src: string; contentType?: string }>();
  const visit = (item: unknown, parentKey?: string) => {
    if (typeof item === "string") {
      const source = audioSourceFromString(item, parentKey);
      if (source) sources.set(source.src, source);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, parentKey));
      return;
    }
    if (!isRecord(item)) return;

    const url = typeof item.url === "string" ? item.url : undefined;
    const contentType =
      typeof item.content_type === "string"
        ? item.content_type
        : typeof item.contentType === "string"
          ? item.contentType
          : undefined;
    if (url && (contentType?.startsWith("audio/") || isAudioUrl(url))) {
      sources.set(url, { src: url, ...(contentType ? { contentType } : {}) });
    }

    for (const [key, child] of Object.entries(item)) {
      visit(child, key);
    }
  };
  visit(value);
  return [...sources.values()];
}

function audioSourceFromString(value: string, key?: string) {
  if (value.startsWith("data:audio/")) return { src: value };
  if (isAudioUrl(value)) return { src: value };
  if (key && /audio(Content|_content)?|audio|voice/i.test(key) && looksLikeBase64(value)) {
    return { src: `data:audio/mpeg;base64,${value}` };
  }
  return undefined;
}

function isMediaUrl(url: string, kind: "image" | "video") {
  if (!/^https?:\/\//i.test(url)) return false;
  return kind === "image"
    ? /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(url)
    : /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url);
}

function isAudioUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  return /\.(mp3|wav|ogg|opus|m4a|aac|flac)(?:[?#].*)?$/i.test(url);
}

function looksLikeBase64(value: string) {
  const compact = value.trim();
  return compact.length > 80 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function matchesContentType(contentType: string | undefined, kind: "image" | "video") {
  return kind === "image"
    ? contentType?.startsWith("image/")
    : contentType?.startsWith("video/");
}

function textResult(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  for (const key of ["text", "output", "answer", "summary", "result"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function looksLikeHtml(value: string) {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]/i.test(value);
}

function summarizeHtml(value: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(value)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(
    value,
  )?.[1];
  return [
    title ? `Title: ${title}` : undefined,
    description ? `Description: ${description}` : undefined,
    "The provider returned an HTML document instead of a structured API response.",
  ]
    .filter(Boolean)
    .join("\n");
}

function truncateText(value: string, max = 1_200) {
  return value.length > max ? `${value.slice(0, max).trimEnd()}\n...[truncated]` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
