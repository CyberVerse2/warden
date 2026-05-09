import { notFound } from "next/navigation";
import { Shell } from "~/components/shell";
import { MCPSnippets } from "~/components/mcp-snippets";
import { getOrigin } from "~/lib/origin";
import { getAgent } from "~/lib/queries";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export const dynamic = "force-dynamic";

export default async function AgentTokenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;
  const [agent, origin] = await Promise.all([getAgent(id), getOrigin()]);
  if (!agent) return notFound();

  return (
    <Shell active="/agents">
      <header className="px-8 pt-10 pb-6 border-b border-hairline">
        <a href={`/agents/${id}`} className="mono text-t4 text-[11px] hover:text-t2">
          ← AGENT · {agent.name}
        </a>
        <h1 className="mt-2 text-[28px] tracking-[-0.025em] text-t1 font-medium">
          Save this token
        </h1>
        <p className="mt-1 text-t3 text-[13.5px] max-w-[64ch] leading-relaxed">
          Warden only shows agent tokens once. Copy the connection block below
          before navigating away — every snippet has the token embedded so you
          can paste it straight into your MCP client.
        </p>
      </header>
      <section className="p-8">
        {token ? (
          <MCPSnippets
            agentId={agent.id}
            agentName={agent.name}
            url={`${origin}/api/mcp/${agent.id}`}
            token={token}
          />
        ) : (
          <p className="text-deny mono text-[13px]">
            ✕ Token missing. Rotate the token from the agent detail page to
            issue a new one.
          </p>
        )}
      </section>
    </Shell>
  );
}
