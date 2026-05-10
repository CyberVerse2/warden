import { notFound, redirect } from "next/navigation";
import { Shell } from "~/components/shell";
import { getAgent, getAgentChatMessages } from "~/lib/queries";
import { getOrigin } from "~/lib/origin";
import { AgentChat } from "./agent-chat";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export const dynamic = "force-dynamic";

export default async function AgentChatPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;
  if (id === "not-real") redirect("/agents");

  const agent = await getAgent(id);
  if (!agent) return notFound();

  const [history, origin] = await Promise.all([
    getAgentChatMessages(id),
    getOrigin(),
  ]);
  if (!history) return notFound();

  const mcpUrl = `${origin}/api/mcp/${agent.id}`;

  return (
    <Shell active="/agents">
      <div className="flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-hairline px-5 py-3">
          <div className="flex items-center gap-3">
          <a
            href={`/agents/${agent.id}`}
            className="mono text-t4 text-[11px] hover:text-t2"
          >
            ← AGENT
          </a>
          <span className="mono text-t4 text-[11px]">/ MCP CHAT</span>
            <h1 className="ml-2 text-[17px] text-t1 font-medium">
              Agent chat
            </h1>
            <span className="ml-auto label">Agent</span>
            <span className="text-[12.5px] text-t1">{agent.name}</span>
          </div>
        </header>
        <AgentChat
          agentId={agent.id}
          agentName={agent.name}
          mcpUrl={mcpUrl}
          initialToken={token}
          initialMessages={history}
        />
      </div>
    </Shell>
  );
}
