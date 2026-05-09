/*
 * Inline SVG illustrations and composite layouts used on the landing page.
 * Each one explains a concept in one glance (the control plane, the policy
 * gate, the receipt strip, the bad options users come from) using one
 * palette: hairline strokes, amber signal, allow-green, deny-red.
 */

const STROKE = "currentColor";

/* ------------------------------------------------------------------------ */
/* Hero: control plane diagram                                               */
/* ------------------------------------------------------------------------ */

export function ControlPlaneDiagram() {
  return (
    <div className="relative border border-hairline-strong bg-bg-deep/70 p-6 select-none">
      {/* Corner markers */}
      <Corners />

      <div className="flex items-baseline justify-between mb-4">
        <span className="mono text-t4 text-[10.5px]">DIAGRAM · CONTROL PLANE</span>
        <span className="mono text-t4 text-[10.5px]">live loop</span>
      </div>

      <svg
        viewBox="0 0 720 280"
        className="w-full h-auto"
        role="img"
        aria-label="Agent request enters policy gate, signs through wallet, settles via x402, and is appended to the receipt ledger."
      >
        <defs>
          <marker
            id="cp-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--signal)" opacity="0.85" />
          </marker>
          <marker
            id="cp-arrow-back"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--signal-dim)" opacity="0.7" />
          </marker>
        </defs>

        {/* Main horizontal flow line */}
        <line
          x1="80" y1="120" x2="640" y2="120"
          stroke="var(--signal)" strokeWidth="1" strokeDasharray="2 4" opacity="0.45"
        />

        {/* Receipt feedback loop */}
        <path
          d="M 580 120 C 580 220, 200 220, 140 220 L 100 220"
          fill="none"
          stroke="var(--signal-dim)"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.5"
          markerEnd="url(#cp-arrow-back)"
        />

        {/* Nodes */}
        <Node x={70} y={90} label="AGENT" sub="research-01" tone="signal">
          <AgentGlyph />
        </Node>
        <Node x={210} y={90} label="POLICY" sub="v.04 · live" tone="t1">
          <GateGlyph />
        </Node>
        <Node x={350} y={90} label="WALLET" sub="warden-signer" tone="t1">
          <WalletGlyph />
        </Node>
        <Node x={490} y={90} label="X402" sub="pay.sh sdk" tone="signal">
          <X402Glyph />
        </Node>
        <Node x={630} y={90} label="RECEIPT" sub="append-only" tone="t1">
          <ReceiptGlyph />
        </Node>

        {/* Arrows on the main line */}
        <FlowArrow x={140} />
        <FlowArrow x={280} />
        <FlowArrow x={420} />
        <FlowArrow x={560} />

        {/* Labels under feedback loop */}
        <text x="360" y="240" textAnchor="middle" className="mono"
          fill="var(--text-3)" fontSize="9" letterSpacing="0.12em">
          RECEIPT · WRITTEN BACK
        </text>

        {/* Pulsing dot traveling the line */}
        <circle r="2.5" fill="var(--signal)">
          <animateMotion
            dur="3.6s"
            repeatCount="indefinite"
            path="M 90 120 L 620 120"
          />
        </circle>
      </svg>

      <div className="mt-4 grid grid-cols-5 divide-x divide-hairline border-t border-hairline pt-3">
        {[
          ["01", "AGENT"],
          ["02", "POLICY"],
          ["03", "WALLET"],
          ["04", "X402"],
          ["05", "RECEIPT"],
        ].map(([n, l]) => (
          <div key={n} className="px-2 flex flex-col gap-0.5 items-center">
            <span className="mono text-signal text-[10px]">{n}</span>
            <span className="label text-[9.5px]">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({
  x,
  y,
  label,
  sub,
  tone,
  children,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  tone: "signal" | "allow" | "t1";
  children: React.ReactNode;
}) {
  const color =
    tone === "signal"
      ? "var(--signal)"
      : tone === "allow"
      ? "var(--allow)"
      : "var(--text-1)";
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x="0" y="0" width="80" height="60"
        fill="var(--bg-base)"
        stroke="var(--hairline-strong)"
        strokeWidth="1"
      />
      <rect x="0" y="0" width="80" height="2" fill={color} opacity="0.65" />
      <g transform="translate(28, 12)">{children}</g>
      <text x="40" y="74" textAnchor="middle" className="mono"
        fill="var(--text-1)" fontSize="9" letterSpacing="0.14em">
        {label}
      </text>
      <text x="40" y="86" textAnchor="middle" className="mono"
        fill="var(--text-4)" fontSize="8.5">
        {sub}
      </text>
    </g>
  );
}

function FlowArrow({ x }: { x: number }) {
  return (
    <g>
      <path
        d={`M ${x - 6} 117 L ${x + 4} 120 L ${x - 6} 123 z`}
        fill="var(--signal)"
        opacity="0.85"
      />
    </g>
  );
}

function AgentGlyph() {
  return (
    <g stroke={STROKE} strokeWidth="1.2" fill="none" color="var(--signal)">
      <circle cx="12" cy="10" r="4" />
      <path d="M4 26 C 4 18, 20 18, 20 26" />
      <circle cx="12" cy="10" r="1.2" fill="var(--signal)" stroke="none" />
    </g>
  );
}

function GateGlyph() {
  return (
    <g stroke={STROKE} strokeWidth="1.2" fill="none" color="var(--text-1)">
      <path d="M3 6 L12 2 L21 6 L21 18 L12 24 L3 18 z" />
      <path d="M9 13 L11 15 L15 11" stroke="var(--allow)" strokeWidth="1.4" />
    </g>
  );
}

function WalletGlyph() {
  return (
    <g stroke={STROKE} strokeWidth="1.2" fill="none" color="var(--text-1)">
      <rect x="3" y="6" width="18" height="14" />
      <path d="M3 10 L21 10" />
      <circle cx="17" cy="15" r="1.2" fill="var(--signal)" stroke="none" />
    </g>
  );
}

function X402Glyph() {
  return (
    <g stroke={STROKE} strokeWidth="1.2" fill="none" color="var(--signal)">
      <circle cx="12" cy="13" r="9" />
      <text x="12" y="16" textAnchor="middle" fontSize="7"
        fill="var(--signal)" stroke="none" className="mono">402</text>
    </g>
  );
}

function ReceiptGlyph() {
  return (
    <g stroke={STROKE} strokeWidth="1.2" fill="none" color="var(--text-1)">
      <path d="M5 4 L19 4 L19 22 L16 20 L13 22 L10 20 L7 22 L5 20 z" />
      <path d="M8 9 L16 9" />
      <path d="M8 13 L16 13" />
      <path d="M8 17 L13 17" />
    </g>
  );
}

function Corners() {
  return (
    <>
      {[
        "top-1.5 left-1.5 border-t border-l",
        "top-1.5 right-1.5 border-t border-r",
        "bottom-1.5 left-1.5 border-b border-l",
        "bottom-1.5 right-1.5 border-b border-r",
      ].map((cls) => (
        <span
          key={cls}
          className={`absolute w-2 h-2 border-signal/60 pointer-events-none ${cls}`}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Live flow strip: agent, policy, payment, receipt                          */
/* ------------------------------------------------------------------------ */

const FLOW_ROWS = [
  {
    decision: "allow" as const,
    request: {
      agent: "research-agent",
      method: "GET",
      host: "api.helius.xyz",
      path: "/v0/transactions",
    },
    policy: {
      version: "v.04",
      rule: "host · helius.xyz · ALLOWED",
      cap: "$0.10 per req · 6% used",
    },
    payment: {
      amount: "$0.0125",
      asset: "USDC · solana",
      sig: "5Ah…q3F",
    },
    receipt: {
      id: "rcpt_a8f2…91",
      hash: "0x4c…7e1",
      status: "settled",
    },
  },
  {
    decision: "deny" as const,
    request: {
      agent: "research-agent",
      method: "POST",
      host: "rpc.unknown.io",
      path: "/feed",
    },
    policy: {
      version: "v.04",
      rule: "host · NOT IN ALLOWLIST",
      cap: "request · $8.00",
    },
    payment: {
      amount: "not signed",
      asset: "no signing",
      sig: "not signed",
    },
    receipt: {
      id: "rcpt_d2c9…04",
      hash: "0x9b…2af",
      status: "denied · host",
    },
  },
];

export function LiveFlowStrip() {
  return (
    <div className="overflow-x-auto border border-hairline-strong bg-bg-deep/40">
      <div className="min-w-[860px]">
        {/* Column header */}
        <div className="grid grid-cols-[40px_1fr_1fr_1fr_1fr] border-b border-hairline-strong">
          <div className="px-3 py-2 border-r border-hairline">
            <span className="label text-[9.5px]">·</span>
          </div>
          {[
            ["01", "AGENT REQUEST"],
            ["02", "POLICY DECISION"],
            ["03", "X402 PAYMENT"],
            ["04", "RECEIPT"],
          ].map(([n, l], i, arr) => (
            <div
              key={n}
              className={`px-4 py-2 flex items-baseline gap-3 ${
                i < arr.length - 1 ? "border-r border-hairline" : ""
              }`}
            >
              <span className="mono text-signal text-[10px]">{n}</span>
              <span className="label text-[10px]">{l}</span>
            </div>
          ))}
        </div>

        {FLOW_ROWS.map((row, idx) => (
          <FlowRow key={idx} row={row} index={idx} />
        ))}
      </div>
    </div>
  );
}

function FlowRow({
  row,
  index,
}: {
  row: (typeof FLOW_ROWS)[number];
  index: number;
}) {
  const tone = row.decision === "allow" ? "text-allow" : "text-deny";
  const denied = row.decision === "deny";

  return (
    <div
      className={`grid grid-cols-[40px_1fr_1fr_1fr_1fr] ${
        index < FLOW_ROWS.length - 1 ? "border-b border-hairline" : ""
      }`}
    >
      <div className="border-r border-hairline flex flex-col items-center justify-center py-5 gap-1">
        <span className={`mono text-[14px] ${tone}`}>
          {denied ? "✕" : "●"}
        </span>
        <span className="mono text-t4 text-[9px]">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* AGENT REQUEST */}
      <Cell>
        <KV k="agent" v={row.request.agent} accent />
        <KV k="verb" v={`${row.request.method} ${row.request.path}`} mono />
        <KV k="host" v={row.request.host} mono />
      </Cell>

      {/* POLICY DECISION */}
      <Cell>
        <div className="flex items-center gap-2">
          <Chip tone={row.decision}>
            {row.decision === "allow" ? "ALLOW" : "DENY"}
          </Chip>
          <span className="mono text-t4 text-[9.5px]">{row.policy.version}</span>
        </div>
        <KV k="rule" v={row.policy.rule} mono />
        <KV k="cap" v={row.policy.cap} mono dim={denied} />
      </Cell>

      {/* X402 PAYMENT */}
      <Cell>
        <KV
          k="amount"
          v={row.payment.amount}
          mono
          dim={denied}
          accent={!denied}
        />
        <KV k="asset" v={row.payment.asset} mono dim={denied} />
        <KV k="sig" v={row.payment.sig} mono dim={denied} />
      </Cell>

      {/* RECEIPT */}
      <Cell border={false}>
        <KV k="id" v={row.receipt.id} mono />
        <KV k="hash" v={row.receipt.hash} mono />
        <div className="flex items-center gap-2">
          <span className="label text-[9.5px]">status</span>
          <span className={`mono text-[11px] ${tone}`}>
            {row.receipt.status}
          </span>
        </div>
      </Cell>
    </div>
  );
}

function Cell({
  children,
  border = true,
}: {
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={`px-4 py-4 flex flex-col gap-1.5 ${
        border ? "border-r border-hairline" : ""
      }`}
    >
      {children}
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  accent,
  dim,
}: {
  k: string;
  v: string;
  mono?: boolean;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="grid grid-cols-[58px_1fr] items-baseline gap-2">
      <span className="label text-[9.5px]">{k}</span>
      <span
        className={`${mono ? "mono" : ""} text-[11.5px] truncate ${
          dim ? "text-t4" : accent ? "text-signal" : "text-t1"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "allow" | "deny" | "pending" | "neutral";
}) {
  const map = {
    allow: "text-allow border-allow-dim",
    deny: "text-deny border-deny-dim",
    pending: "text-pending border-pending-dim",
    neutral: "text-t3 border-hairline",
  };
  return (
    <span
      className={`mono text-[9.5px] tracking-[0.14em] uppercase border px-1.5 py-0.5 ${map[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Dashboard preview band                                                    */
/* ------------------------------------------------------------------------ */

const PREVIEW_AGENTS = [
  {
    name: "research-agent",
    role: "Research",
    walletTail: "9F2…aT4",
    today: 1.42,
    cap: 5.0,
    status: "active" as const,
    last: "Helius · /v0/txs",
  },
  {
    name: "ops-agent",
    role: "Ops",
    walletTail: "B7c…dQ8",
    today: 0.05,
    cap: 2.0,
    status: "active" as const,
    last: "QuickNode · ping",
  },
  {
    name: "trading-agent",
    role: "Trading",
    walletTail: "Kx1…m3R",
    today: 12.4,
    cap: 25.0,
    status: "throttled" as const,
    last: "Jupiter · quote",
  },
];

const PREVIEW_RECEIPTS = [
  ["00:14:33", "allow", "research-agent", "helius.xyz · /v0/transactions", "$0.0125"],
  ["00:13:21", "allow", "ops-agent", "quicknode.com · /ping", "$0.0010"],
  ["00:11:08", "deny", "research-agent", "unknown.io · /feed", "$8.0000"],
  ["00:09:45", "allow", "trading-agent", "jup.ag · /quote", "$0.4200"],
  ["00:08:11", "pending", "trading-agent", "jup.ag · /swap", "$2.5000"],
] as const;

export function DashboardPreviewBand() {
  return (
    <div className="border border-hairline-strong bg-bg-deep/60 select-none">
      {/* Top strip: treasury and counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-hairline border-b border-hairline-strong">
        <PreviewMetric label="TREASURY · POOLED" value="$48.30" sub="3 wallets · live" />
        <PreviewMetric
          label="SPEND · TODAY"
          value="$13.87"
          sub="of $32.00 cap"
          tone="signal"
          progress={13.87 / 32}
        />
        <PreviewMetric
          label="PENDING APPROVAL"
          value="01"
          sub="1 request"
          tone="pending"
        />
        <PreviewMetric
          label="BLOCKED · 24H"
          value="02"
          sub="$8.00 prevented"
          tone="deny"
        />
      </div>

      {/* Agent cards row */}
      <div className="border-b border-hairline-strong">
        <div className="px-4 py-2 flex items-baseline gap-3 border-b border-hairline">
          <span className="label text-[10px]">Agents</span>
          <span className="ml-auto mono text-t4 text-[10px]">3 active</span>
        </div>
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-hairline">
          {PREVIEW_AGENTS.map((a) => (
            <AgentPreviewCard key={a.name} a={a} />
          ))}
        </div>
      </div>

      {/* Receipts strip */}
      <div>
        <div className="px-4 py-2 flex items-baseline gap-3 border-b border-hairline">
          <span className="label text-[10px]">Recent receipts</span>
          <span className="ml-auto mono text-t4 text-[10px]">
            append-only, last 5
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[64px_18px_140px_1fr_72px] gap-3 px-4 py-2 border-b border-hairline-strong text-[10px]">
              <span className="label">UTC</span>
              <span />
              <span className="label">Agent</span>
              <span className="label">Target</span>
              <span className="label text-right">Amount</span>
            </div>
            {PREVIEW_RECEIPTS.map(([time, decision, agent, target, amount]) => {
              const tone =
                decision === "deny"
                  ? "text-deny"
                  : decision === "pending"
                  ? "text-pending"
                  : "text-allow";
              const glyph =
                decision === "deny" ? "✕" : decision === "pending" ? "◐" : "●";
              return (
                <div
                  key={time + agent}
                  className="grid grid-cols-[64px_18px_140px_1fr_72px] gap-3 px-4 py-2 border-b border-hairline/60 last:border-b-0 items-center text-[11.5px]"
                >
                  <span className="mono text-t4 text-[10.5px]">{time}</span>
                  <span className={`mono ${tone}`}>{glyph}</span>
                  <span className="text-t1 truncate">{agent}</span>
                  <span className="text-t3 truncate text-[10.5px]">{target}</span>
                  <span className="label-num text-t1 text-right text-[11.5px]">
                    {amount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  sub,
  tone,
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "signal" | "deny" | "pending";
  progress?: number;
}) {
  const valueClass =
    tone === "signal"
      ? "text-signal"
      : tone === "deny"
      ? "text-deny"
      : tone === "pending"
      ? "text-pending"
      : "text-t1";
  return (
    <div className="px-4 py-3 flex flex-col gap-1">
      <span className="label text-[9.5px]">{label}</span>
      <span className={`label-num text-[18px] tracking-[-0.01em] ${valueClass}`}>
        {value}
      </span>
      {progress !== undefined && (
        <div className="h-[2px] bg-hairline overflow-hidden">
          <div
            className="h-full bg-signal"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      )}
      {sub && <span className="mono text-t4 text-[10px]">{sub}</span>}
    </div>
  );
}

function AgentPreviewCard({
  a,
}: {
  a: (typeof PREVIEW_AGENTS)[number];
}) {
  const pct = a.today / a.cap;
  return (
    <div className="px-4 py-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="mono text-signal text-[10.5px]">{a.role}</span>
        <span className="ml-auto">
          <Chip tone={a.status === "active" ? "allow" : "pending"}>
            {a.status}
          </Chip>
        </span>
      </div>
      <span className="text-t1 text-[13.5px] tracking-[-0.005em]">
        {a.name}
      </span>
      <div className="grid grid-cols-[58px_1fr] items-baseline gap-2">
        <span className="label text-[9.5px]">wallet</span>
        <span className="mono text-t3 text-[11px]">{a.walletTail}</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="label text-[9.5px]">today</span>
          <span className="label-num text-t1 text-[11px]">
            ${a.today.toFixed(2)}
            <span className="text-t4"> / ${a.cap.toFixed(2)}</span>
          </span>
        </div>
        <div className="h-[2px] bg-hairline overflow-hidden">
          <div
            className={`h-full ${
              pct > 0.8 ? "bg-pending" : "bg-allow"
            }`}
            style={{ width: `${Math.min(pct * 100, 100)}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-[58px_1fr] items-baseline gap-2">
        <span className="label text-[9.5px]">last</span>
        <span className="mono text-t3 text-[10.5px] truncate">{a.last}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Policy gate visual: split path                                            */
/* ------------------------------------------------------------------------ */

const GATE_RULES = [
  { rule: "revoked agent", check: true },
  { rule: "host in allowlist", check: true },
  { rule: "network · solana", check: true },
  { rule: "token · USDC", check: true },
  { rule: "per-request cap", check: true },
  { rule: "daily cap remaining", check: false },
];

export function PolicyGateVisual() {
  return (
    <div className="border border-hairline-strong bg-bg-deep/40">
      <div className="px-4 py-2 border-b border-hairline-strong flex items-baseline gap-3">
        <span className="mono text-signal text-[10.5px]">GATE</span>
        <span className="text-t1 text-[12px]">Pure-function evaluator</span>
        <span className="ml-auto mono text-t4 text-[10px]">first failure wins</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_1fr] items-stretch">
        {/* Inbound request envelope */}
        <div className="p-6 border-b md:border-b-0 md:border-r border-hairline flex flex-col gap-3">
          <span className="label text-[10px]">INBOUND</span>
          <div className="border border-hairline-strong p-3 flex flex-col gap-1.5 bg-bg-deep">
            <KV k="agent" v="research-01" mono accent />
            <KV k="host" v="api.helius.xyz" mono />
            <KV k="cost" v="$0.0125 USDC" mono />
          </div>
          <span className="mono text-signal text-[10.5px]">request enters</span>
        </div>

        {/* Gate */}
        <div className="p-4 flex flex-col gap-2.5 border-b md:border-b-0 md:border-r border-hairline">
          {GATE_RULES.map((r, i) => (
            <div
              key={r.rule}
              className="flex items-center gap-2.5 text-[11.5px]"
            >
              <span className="mono text-t4 text-[9.5px] w-4">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`mono text-[12px] ${
                  r.check ? "text-allow" : "text-deny"
                }`}
              >
                {r.check ? "✓" : "✕"}
              </span>
              <span
                className={`${
                  r.check ? "text-t1" : "text-deny"
                } truncate`}
              >
                {r.rule}
              </span>
            </div>
          ))}
        </div>

        {/* Outbound split path */}
        <div className="p-6 flex flex-col justify-between gap-4">
          <div className="border border-allow-dim/60 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Chip tone="allow">ALLOW</Chip>
              <span className="mono text-t4 text-[10px]">→ x402 sign</span>
            </div>
            <span className="mono text-t3 text-[10.5px]">
              SPL transfer · USDC · solana
            </span>
          </div>
          <div className="border border-deny-dim/60 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Chip tone="deny">DENY</Chip>
              <span className="mono text-t4 text-[10px]">→ receipt only</span>
            </div>
            <span className="mono text-t3 text-[10.5px]">
              reason · daily cap · logged
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
