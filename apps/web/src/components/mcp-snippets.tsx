import { CopyButton } from "./copy-button";

export interface MCPSnippetProps {
  agentId: string;
  agentName: string;
  url: string;
  token?: string;
}

export function MCPSnippets({ agentId, agentName, url, token }: MCPSnippetProps) {
  const tokenValue = token ?? "<YOUR_AGENT_TOKEN>";
  const placeholder = !token;
  const slug = agentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const claudeCode = JSON.stringify(
    {
      mcpServers: {
        [`warden-${slug}`]: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${tokenValue}` },
        },
      },
    },
    null,
    2,
  );

  const codex = `[mcp_servers.warden-${slug}]\nurl = "${url}"\nheaders = { Authorization = "Bearer ${tokenValue}" }\n`;

  const curl = `curl -X POST '${url}' \\\n  -H 'Authorization: Bearer ${tokenValue}' \\\n  -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <div className="flex flex-col gap-6">
      <UrlRow label="CONNECTION URL" value={url} />
      <UrlRow label="AUTHENTICATION" value={`Bearer ${tokenValue}`} mask={placeholder} />
      <Snippet label="CLAUDE CODE · ~/.claude.json" code={claudeCode} placeholder={placeholder} />
      <Snippet label="CODEX · ~/.codex/config.toml" code={codex} placeholder={placeholder} />
      <Snippet label="VERIFY · curl" code={curl} placeholder={placeholder} />
      <p className="text-t4 text-[11.5px] leading-relaxed max-w-[68ch]">
        Agent id <span className="mono text-t2">{agentId}</span>. Tokens are
        only revealed once on creation or rotation; if you missed it, rotate
        from the agent detail page to issue a new one.
      </p>
    </div>
  );
}

function UrlRow({
  label,
  value,
  mask,
}: {
  label: string;
  value: string;
  mask?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {!mask && <CopyButton text={value} />}
      </div>
      <code className="mono text-t1 text-[12.5px] block bg-bg-deep border border-hairline-strong p-3 break-all">
        {value}
      </code>
    </div>
  );
}

function Snippet({
  label,
  code,
  placeholder,
}: {
  label: string;
  code: string;
  placeholder?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {!placeholder && <CopyButton text={code} />}
      </div>
      <pre className="mono text-t1 text-[12px] bg-bg-deep border border-hairline-strong p-4 overflow-x-auto leading-[1.55]">
        {code}
      </pre>
    </div>
  );
}
