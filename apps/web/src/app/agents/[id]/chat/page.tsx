import { notFound } from "next/navigation";
import { Shell } from "~/components/shell";
import { getAgent } from "~/lib/queries";
import { getOrigin } from "~/lib/origin";
import { AgentChat } from "./agent-chat";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AgentChatPage({ params }: Props) {
  const { id } = await params;
  const [agent, origin] = await Promise.all([getAgent(id), getOrigin()]);
  if (!agent) return notFound();

  const mcpUrl = `${origin}/api/mcp/${agent.id}`;

  return (
    <Shell active="/agents">
      <header className="border-b border-hairline px-8 pt-10 pb-6">
        <div className="flex items-baseline gap-3">
          <a
            href={`/agents/${agent.id}`}
            className="mono text-t4 text-[11px] hover:text-t2"
          >
            ← AGENT
          </a>
          <span className="mono text-t4 text-[11px]">/ MCP CHAT</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] tracking-[-0.025em] text-t1 font-medium">
              Agent chat
            </h1>
            <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-t3">
              A demonstration agent that discovers this server's MCP tools, selects
              one from the prompt, and calls it through JSON-RPC using bearer auth.
            </p>
          </div>
          <div className="border border-hairline-strong px-4 py-3 text-right">
            <span className="label">Agent</span>
            <div className="mt-1 text-[13px] text-t1">{agent.name}</div>
          </div>
        </div>
      </header>
      <AgentChat agentId={agent.id} agentName={agent.name} mcpUrl={mcpUrl} />
    </Shell>
  );
}
