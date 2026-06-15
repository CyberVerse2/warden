import { cookies } from "next/headers";
import Link from "next/link";
import { getPayCatalogSummary } from "@warden/x402";
import { BrandMark } from "~/components/brand-mark";

export const dynamic = "force-dynamic";

const PRIVY_COOKIES = ["privy-token", "privy-id-token", "privy:token"];

// Human-readable labels for the pay.sh catalog category slugs.
const CATEGORY_LABELS: Record<string, string> = {
  ai_ml: "AI / ML",
  finance: "Finance",
  data: "Data",
  media: "Media",
  messaging: "Messaging",
  maps: "Maps",
  translation: "Translation",
  security: "Security",
  search: "Search",
  shopping: "Shopping",
  cloud: "Cloud",
  storage: "Storage",
  devtools: "Dev tools",
  compute: "Compute",
};

const categoryLabel = (slug: string) =>
  CATEGORY_LABELS[slug] ?? slug.replace(/_/g, " ");

// Real brand logos (in /public/landing-assets/logos) for providers the
// catalog reaches — directly or through aggregators like StableEnrich.
const API_LOGOS = [
  ["Google Cloud", "google-cloud"],
  ["Alibaba Cloud", "alibaba-cloud"],
  ["Gemini", "gemini"],
  ["Perplexity", "perplexity"],
  ["Wolfram Alpha", "wolfram"],
  ["Tripadvisor", "tripadvisor"],
  ["Google Maps", "google-maps"],
  ["Reddit", "reddit"],
  ["Cloudflare", "cloudflare"],
  ["Alchemy", "alchemy"],
  ["Ethereum", "ethereum"],
] as const;

const BAD_OPTIONS = [
  "Hand over your API keys.",
  "Give it a raw private key.",
  "Approve every paid call by hand.",
  "Let it pay unknown services blindly.",
] as const;

const LOOP_STEPS = [
  ["Fund the agent wallet with stablecoins.", "deposit"],
  ["Agent requests a paid action.", "action"],
  ["Warden checks spend, provider, policy, and risk.", "inspect"],
  ["Approved calls get paid from the wallet.", "pay"],
  ["Risky or malicious requests stop before funds move.", "block"],
  ["Every action writes a receipt.", "ledger"],
] as const;

const TOOLS = [
  ["warden_fetch", "HTTP with the x402 dance built in. Pays only what policy allows."],
  ["warden_quote", "Read the real x402 challenge before payment."],
  ["warden_analyze", "Analyze policy and AI risk before spending."],
  ["warden_receipts", "Audit trail for the agent."],
] as const;

export default async function LandingPage() {
  const c = await cookies();
  const isAuthed = PRIVY_COOKIES.some((n) => c.has(n));
  const ctaHref = isAuthed ? "/agents" : "/login";
  const consoleHref = isAuthed ? "/dashboard" : "/login";

  const catalog = getPayCatalogSummary();

  return (
    <main className="brand-grid min-h-dvh">
      {/* RIBBON */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-bg-base/85 backdrop-blur">
        <div className="max-w-[1240px] mx-auto px-8 h-14 flex items-center gap-6">
          <Link href="/" aria-label="Warden home" className="shrink-0">
            <BrandMark size="sm" />
          </Link>
          <nav className="ml-auto hidden md:flex items-center gap-6">
            <a href="#how" className="label text-t4 hover:text-t1 transition-colors">
              HOW IT WORKS
            </a>
            <a href="#apis" className="label text-t4 hover:text-t1 transition-colors">
              APIS
            </a>
            <a href="#mcp" className="label text-t4 hover:text-t1 transition-colors">
              MCP
            </a>
            <a href={consoleHref} className="label text-t4 hover:text-t1 transition-colors">
              CONSOLE
            </a>
            <a
              href={ctaHref}
              className="label px-3 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base transition-colors"
            >
              CREATE WALLET →
            </a>
          </nav>
          <a
            href={ctaHref}
            className="ml-auto md:hidden label px-3 py-2 border border-signal-dim text-signal"
          >
            CREATE WALLET
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative border-b border-hairline overflow-hidden">
        <HeroBackdrop />
        <div className="relative max-w-[1240px] mx-auto px-8 pt-20 pb-24">
          <div className="flex items-center gap-3">
            <span className="mono inline-flex items-center gap-1.5 text-allow text-[11px]">
              <span className="size-1.5 rounded-full bg-allow animate-pulse" />
              LIVE · CELO SEPOLIA
            </span>
            <span className="mono text-t4 text-[11px]">·</span>
            <span className="mono text-t4 text-[11px]">
              agent walleting / stablecoin spend
            </span>
          </div>

          <h1 className="mt-8 text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.98] tracking-[-0.045em] font-medium">
            <span className="block text-t1">Give your agent a wallet</span>
            <span className="block text-signal">for real-world work.</span>
          </h1>

          <p className="mt-10 text-t1 text-[20px] leading-[1.45] max-w-[58ch]">
            Fund an agent. Watch every dollar.
          </p>
          <p className="mt-5 text-t2 text-[16px] leading-[1.6] max-w-[60ch]">
            Warden sits between your agent and the spend. It gives the agent a
            stablecoin wallet, then checks spend, provider, policy, and risk
            before any payment moves.
          </p>

          <div className="mt-12 flex items-center gap-5 flex-wrap">
            <a
              href={ctaHref}
              className="label px-6 py-3.5 border border-signal text-signal hover:bg-signal hover:text-bg-base transition-colors"
            >
              CREATE AGENT WALLET →
            </a>
            <a
              href="#how"
              className="label px-6 py-3.5 border border-hairline-strong text-t2 hover:text-t1 hover:border-t3 transition-colors"
            >
              HOW IT WORKS
            </a>
          </div>

          <div className="mt-20">
            <HeroDiagram />
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24 grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-x-16 gap-y-10 items-start">
          <div>
            <span className="label text-t4">THE PROBLEM</span>
            <h2 className="mt-4 text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Agents cannot do real-world work without money.
            </h2>
            <p className="mt-6 text-t2 text-[15.5px] leading-[1.65] max-w-[44ch]">
              The moment an agent needs to search, query, compute, generate, or
              call a paid API, it needs a way to pay. Every option for handing it
              money is a bad one.
            </p>
          </div>

          <div className="border-l border-hairline pl-8">
            <span className="label text-t4">WITHOUT WARDEN, YOUR OPTIONS ARE BAD</span>
            <ul className="mt-6 flex flex-col">
              {BAD_OPTIONS.map((line, i) => (
                <li
                  key={line}
                  className="grid grid-cols-[42px_1fr] gap-3 items-baseline py-4 border-b border-hairline/70 last:border-b-0"
                >
                  <span className="mono text-deny text-[12px] tabular">0{i + 1} ✕</span>
                  <span className="text-t2 text-[15.5px] leading-[1.5] line-through decoration-deny/60 decoration-1">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-t1 text-[15px]">None of that survives production.</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — Warden sits between the agent and the spend */}
      <section id="how" className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24">
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-8 border-b border-hairline">
            <span className="label text-t4">HOW IT WORKS</span>
            <h2 className="text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Warden sits between the agent and the spend.
            </h2>
            <span className="ml-auto mono text-t4 text-[10.5px]">x402 · one loop</span>
          </header>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-10 items-start">
            <div>
              <p className="text-t2 text-[18px] leading-[1.45]">The agent asks.</p>
              <p className="mt-1 text-t2 text-[18px] leading-[1.45]">Warden decides.</p>
              <p className="mt-1 text-t1 text-[18px] leading-[1.45]">
                Only monitored actions get paid.
              </p>

              <p className="mt-8 text-t3 text-[14px] leading-[1.65] max-w-[46ch]">
                Under the hood it speaks x402: read the payment challenge,
                evaluate policy and risk, sign only if allowed, then record the
                result. The agent never touches a key.
              </p>

              <div className="mt-10 border border-hairline-strong bg-bg-deep/60 p-7">
                <span className="label text-t4">OUTCOME GUARANTEES</span>
                <ul className="mt-5 flex flex-col divide-y divide-hairline/70">
                  {[
                    ["No policy", "no spend."],
                    ["No approval", "no signature."],
                    ["No unchecked provider", "gets paid."],
                  ].map(([a, b]) => (
                    <li
                      key={a}
                      className="py-3 flex items-baseline gap-3 first:pt-0 last:pb-0"
                    >
                      <span className="mono text-signal text-[12px]">→</span>
                      <span className="text-t1 text-[15px]">
                        {a}, <span className="text-t3">{b}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="hidden lg:block w-px self-stretch bg-hairline" />

            <ol className="flex flex-col">
              {LOOP_STEPS.map(([text, kind], i) => (
                <li
                  key={text}
                  className="grid grid-cols-[56px_28px_1fr] items-center py-5 border-b border-hairline/60 last:border-b-0"
                >
                  <span className="mono text-t4 text-[11px] tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mono text-signal text-[12px]">●</span>
                  <span className="text-t1 text-[15.5px] leading-[1.5]">
                    {text}
                    <span className="ml-3 mono text-t4 text-[10.5px] uppercase tracking-[0.12em]">
                      {kind}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* SUPPORTED APIS — logo wall */}
      <section id="apis" className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24">
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-8 border-b border-hairline">
            <span className="label text-t4">SUPPORTED APIS</span>
            <h2 className="text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              The APIs your agent can pay for.
            </h2>
            <span className="ml-auto mono text-t4 text-[10.5px]">
              {catalog.endpointCount.toLocaleString()} ENDPOINTS ·{" "}
              {catalog.serviceCount} SERVICES
            </span>
          </header>

          <p className="mt-8 text-t2 text-[15.5px] leading-[1.65] max-w-[64ch]">
            Warden ships the pay.sh x402 catalog — {catalog.serviceCount} services
            across {catalog.endpointCount.toLocaleString()} endpoints. Search,
            data, RPC, AI, OCR, speech, maps, email, and crypto, all behind one
            monitored wallet.
          </p>

          {/* Logo wall */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-hairline border border-hairline-strong">
            {API_LOGOS.map(([name, slug]) => (
              <div
                key={slug}
                className="group bg-bg-deep flex flex-col items-center justify-center gap-3 py-9"
                title={name}
              >
                <span
                  aria-hidden
                  className="h-8 w-8 bg-[var(--text-3)] group-hover:bg-[var(--text-1)] transition-colors"
                  style={{
                    maskImage: `url(/landing-assets/logos/${slug}.svg)`,
                    WebkitMaskImage: `url(/landing-assets/logos/${slug}.svg)`,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskPosition: "center",
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                  }}
                />
                <span className="mono text-t4 text-[11px] tracking-[0.06em] group-hover:text-t2 transition-colors">
                  {name}
                </span>
              </div>
            ))}
          </div>

          {/* Category breakdown */}
          <div className="mt-8 flex flex-wrap gap-2.5">
            {catalog.categories.map((cat) => (
              <span
                key={cat.category}
                className="inline-flex items-baseline gap-2 border border-hairline-strong bg-bg-deep/60 px-3 py-1.5"
              >
                <span className="text-t1 text-[13px]">{categoryLabel(cat.category)}</span>
                <span className="mono text-signal text-[11px] tabular">
                  {cat.serviceCount}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* MCP */}
      <section id="mcp" className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24">
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-8 border-b border-hairline">
            <span className="label text-t4">INTEGRATION</span>
            <h2 className="text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Built for agent runtimes.
            </h2>
          </header>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 items-start">
            <div>
              <p className="text-t2 text-[15.5px] leading-[1.65] max-w-[52ch]">
                Connect Warden through MCP and give your agent payment tools
                without exposing wallet keys.
              </p>

              <span className="mt-8 inline-block label text-t4">WALLET TOOLS</span>
              <ul className="mt-3">
                {TOOLS.map(([name, desc]) => (
                  <li
                    key={name}
                    className="grid grid-cols-[200px_1fr] gap-4 py-3 border-b border-hairline/60 last:border-b-0"
                  >
                    <span className="mono text-signal text-[13px]">{name}</span>
                    <span className="text-t3 text-[13.5px]">{desc}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-8 text-t3 text-[13.5px] leading-[1.6] max-w-[52ch]">
                Works with <span className="text-t1">Codex</span>,{" "}
                <span className="text-t1">Claude</span>,{" "}
                <span className="text-t1">Cursor</span>, custom agents, and any
                runtime that can call MCP or HTTP.
              </p>
            </div>

            <div>
              <div className="border border-hairline-strong bg-bg-deep">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
                  <span className="mono text-t4 text-[10.5px]">~/.config/mcp.json</span>
                  <span className="mono text-t4 text-[10.5px]">JSON</span>
                </div>
                <pre className="mono text-t1 text-[12.5px] p-5 overflow-x-auto leading-[1.65]">
{`{
  "mcpServers": {
    "warden-research-agent": {
      "type": "http",
      "url": "https://warden.example/api/mcp/agt_…",
      "headers": {
        "Authorization": "Bearer wt_tok_…"
      }
    }
  }
}`}
                </pre>
              </div>

              <div className="mt-6 border border-hairline-strong bg-bg-deep p-5">
                <span className="label text-t4">FIRST CALL</span>
                <pre className="mono text-t1 text-[12.5px] mt-3 leading-[1.65] overflow-x-auto">
{`agent → warden_fetch(\"https://api.example/data\")
warden ←  402 challenge · 0.05 USDC
warden ←  policy: allow (under daily budget)
warden →  signed payment proof
agent ←  200 OK · receipt rcpt_01J9…`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-28 text-center">
          <span className="label text-t4">ENTER</span>
          <h2 className="mt-5 text-[clamp(2rem,4.5vw,3.6rem)] tracking-[-0.04em] font-medium leading-[1.02] max-w-[20ch] mx-auto">
            <span className="text-t1">Fund an agent wallet.</span>
            <br />
            <span className="text-signal">Watch every dollar.</span>
          </h2>
          <div className="mt-12 flex items-center justify-center gap-5 flex-wrap">
            <a
              href={ctaHref}
              className="label px-7 py-4 border border-signal text-signal hover:bg-signal hover:text-bg-base transition-colors"
            >
              CREATE AGENT WALLET →
            </a>
            <a
              href="#how"
              className="label px-7 py-4 border border-hairline-strong text-t2 hover:text-t1 hover:border-t3 transition-colors"
            >
              HOW IT WORKS
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-[1240px] mx-auto px-8 py-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px]">
        <span className="mono text-signal">warden</span>
        <span className="mono text-t4">v0.1 · walleting · Celo · x402 · mcp</span>
        <span className="mono text-t4 hidden sm:inline">©{new Date().getFullYear()}</span>
        <a
          href={consoleHref}
          className="ml-auto label text-t4 hover:text-t1 transition-colors"
        >
          CONSOLE
        </a>
        <a href="/login" className="label text-t4 hover:text-t1 transition-colors">
          SIGN IN
        </a>
      </footer>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero backdrop — soft amber glow on the deep blue grid                       */
/* -------------------------------------------------------------------------- */
function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      <div
        className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full blur-[160px] opacity-[0.18]"
        style={{ background: "var(--signal)" }}
      />
      <div
        className="absolute bottom-[-10%] left-[-10%] h-[420px] w-[420px] rounded-full blur-[160px] opacity-[0.10]"
        style={{ background: "var(--allow)" }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero diagram — single horizontal flow: deposit → agent → Warden → wallet */
/* -------------------------------------------------------------------------- */
function HeroDiagram() {
  return (
    <div className="border border-hairline-strong bg-bg-deep/70 p-6 select-none">
      <div className="flex items-baseline justify-between mb-5">
        <span className="mono text-t4 text-[10.5px]">DIAGRAM · ONE REQUEST</span>
        <span className="mono text-allow text-[10.5px]">● APPROVED · 0.05 USDC</span>
      </div>

      <svg
        viewBox="0 0 1100 220"
        className="w-full h-auto"
        role="img"
        aria-label="A funded agent wallet supports a real-world action, Warden checks spend and risk, the wallet signs if allowed, the service returns a result, and a receipt is recorded."
      >
        <defs>
          <marker
            id="arrow"
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
            id="arrow-back"
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

        {/* spine */}
        <line
          x1="80" y1="100" x2="1020" y2="100"
          stroke="var(--signal)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5"
        />
        {/* receipt loopback */}
        <path
          d="M 980 100 C 980 200, 200 200, 140 200 L 100 200"
          fill="none"
          stroke="var(--signal-dim)"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.55"
          markerEnd="url(#arrow-back)"
        />

        {/* nodes */}
        {[
          { x: 80, label: "DEPOSIT", sub: "42.00 USDC" },
          { x: 280, label: "AGENT", sub: "requests action" },
          { x: 480, label: "WARDEN", sub: "spend + risk" },
          { x: 680, label: "WALLET", sub: "sign if allowed" },
          { x: 880, label: "SERVICE", sub: "paid result" },
          { x: 1020, label: "RECEIPT", sub: "rcpt_01J9…" },
        ].map((n, i, arr) => {
          const next = arr[i + 1];
          const isLast = i === arr.length - 1;
          return (
            <g key={n.label}>
              <rect
                x={n.x - 50}
                y={70}
                width={100}
                height={60}
                fill="var(--bg-base)"
                stroke="var(--hairline-strong)"
                strokeWidth="1"
              />
              <text
                x={n.x}
                y={94}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="10"
                fill={
                  isLast || n.label === "DEPOSIT" ? "var(--allow)" : "var(--signal)"
                }
                letterSpacing="0.1em"
              >
                {n.label}
              </text>
              <text
                x={n.x}
                y={114}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="var(--text-3)"
              >
                {n.sub}
              </text>
              {next && (
                <line
                  x1={n.x + 50}
                  y1="100"
                  x2={next.x - 52}
                  y2="100"
                  stroke="var(--signal)"
                  strokeWidth="1.2"
                  opacity="0.85"
                  markerEnd="url(#arrow)"
                />
              )}
              <text
                x={n.x}
                y={56}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="var(--text-4)"
              >
                {String(i + 1).padStart(2, "0")}
              </text>
            </g>
          );
        })}

        <text
          x="540"
          y="195"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fill="var(--text-4)"
          letterSpacing="0.1em"
        >
          APPENDED · WRITE-ONCE
        </text>
      </svg>
    </div>
  );
}
