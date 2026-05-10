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
      <section className="grid grid-cols-[1fr_320px] divide-x divide-hairline">
        <div className="p-8">
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
        </div>

        <aside className="p-8 flex flex-col gap-8">
          <div>
            <span className="label">SETUP ORDER</span>
            <ol className="mt-4 flex flex-col gap-4">
              <SetupStep
                code="01"
                title="Copy MCP config"
                body="Paste the Codex or Claude block into the client that will run this agent."
              />
              <SetupStep
                code="02"
                title="Set policy"
                body="Choose the x402 providers, request cap, daily cap, and approval threshold."
              />
              <SetupStep
                code="03"
                title="Fund wallet"
                body="Send devnet SOL and USDC to the agent wallet before its first paid request."
              />
            </ol>
          </div>

          <div className="border border-hairline-strong bg-bg-deep/50 p-5">
            <span className="label">NEXT</span>
            <p className="mt-3 text-t2 text-[13px] leading-relaxed">
              The agent exists now. Finish its spend rules before connecting it
              to an autonomous runtime.
            </p>
            <a
              href={`/agents/${agent.id}#policy`}
              className="mt-5 inline-flex label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal transition-colors"
            >
              CONFIGURE POLICY →
            </a>
            {token && (
              <a
                href={`/agents/${agent.id}/chat?token=${encodeURIComponent(token)}`}
                className="mt-3 inline-flex label px-4 py-2 border border-hairline-strong text-t2 hover:border-signal-dim hover:text-signal transition-colors"
              >
                OPEN CHAT →
              </a>
            )}
          </div>
        </aside>
      </section>
    </Shell>
  );
}

function SetupStep({
  code,
  title,
  body,
}: {
  code: string;
  title: string;
  body: string;
}) {
  return (
    <li className="grid grid-cols-[32px_1fr] gap-3">
      <span className="mono text-signal text-[11px] pt-0.5">{code}</span>
      <span>
        <span className="block text-t1 text-[13px]">{title}</span>
        <span className="block mt-1 text-t4 text-[12px] leading-relaxed">
          {body}
        </span>
      </span>
    </li>
  );
}
