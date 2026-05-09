import { cookies } from "next/headers";
import Link from "next/link";
import { BrandMark } from "~/components/brand-mark";

export const dynamic = "force-dynamic";

const PRIVY_COOKIES = ["privy-token", "privy-id-token", "privy:token"];

const BAD_OPTIONS = [
  "Give the agent a private key.",
  "Let it share a hot wallet.",
  "Route everything through human approval.",
  "Trust prompts to respect a budget.",
] as const;

const FLOW_STEPS = [
  ["Agent requests a paid resource.", "outbound"],
  ["Warden reads the x402 challenge.", "inspect"],
  ["Policy checks amount, provider, budget, agent, and limits.", "decide"],
  ["Warden signs the payment proof — only if allowed.", "sign"],
  ["The request is retried with proof attached.", "retry"],
  ["A receipt is stored.", "ledger"],
] as const;

const ENFORCE = [
  "Per-request limits",
  "Daily budgets",
  "Provider allowlists",
  "Blocked domains",
  "Manual approval thresholds",
  "Agent revocation",
  "Receipt logging",
] as const;

const X402_STEPS = [
  "Fetch the protected endpoint.",
  "Parse the payment challenge.",
  "Evaluate policy.",
  "Sign the proof.",
  "Retry the request.",
  "Record the result.",
] as const;

const TOOLS = [
  ["warden_fetch", "HTTP with the 402 dance built in. Pays only what policy allows."],
  ["warden_pay", "Force payment against a known x402 endpoint."],
  ["warden_policy_check", "Dry-run a request without spending."],
  ["warden_receipts", "Audit trail for the agent."],
  ["warden_wallet_status", "Pubkey, balance, remaining daily budget."],
] as const;

const NOT_THIS = [
  "Warden is not a wallet app.",
  "Warden is not a payment protocol.",
  "Warden is not another agent framework.",
] as const;

export default async function LandingPage() {
  const c = await cookies();
  const isAuthed = PRIVY_COOKIES.some((n) => c.has(n));
  const ctaHref = isAuthed ? "/agents" : "/login";
  const ctaLabel = isAuthed ? "CREATE AGENT" : "CREATE AGENT";
  const consoleHref = isAuthed ? "/dashboard" : "/login";

  return (
    <main className="min-h-dvh">
      {/* RIBBON */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-bg-base/85 backdrop-blur">
        <div className="max-w-[1240px] mx-auto px-8 h-14 flex items-center gap-6">
          <Link href="/" aria-label="Warden home" className="shrink-0">
            <BrandMark size="sm" />
          </Link>
          <nav className="ml-auto hidden md:flex items-center gap-6">
            <a href="#flow" className="label text-t4 hover:text-t1 transition-colors">
              FLOW
            </a>
            <a href="#wallets" className="label text-t4 hover:text-t1 transition-colors">
              WALLETS
            </a>
            <a href="#mcp" className="label text-t4 hover:text-t1 transition-colors">
              MCP
            </a>
            <a
              href={consoleHref}
              className="label text-t4 hover:text-t1 transition-colors"
            >
              CONSOLE
            </a>
            <a
              href={ctaHref}
              className="label px-3 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base transition-colors"
            >
              {ctaLabel} →
            </a>
          </nav>
          <a
            href={ctaHref}
            className="ml-auto md:hidden label px-3 py-2 border border-signal-dim text-signal"
          >
            {ctaLabel}
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
              LIVE · SOLANA DEVNET
            </span>
            <span className="mono text-t4 text-[11px]">·</span>
            <span className="mono text-t4 text-[11px]">x402 / MCP</span>
          </div>

          <h1 className="mt-8 text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.98] tracking-[-0.045em] font-medium">
            <span className="block text-t1">Let agents pay.</span>
            <span className="block text-signal">Never hand them the keys.</span>
          </h1>

          <p className="mt-10 text-t1 text-[20px] leading-[1.45] max-w-[58ch]">
            Warden is the policy signer for x402 agent payments.
          </p>
          <p className="mt-5 text-t2 text-[16px] leading-[1.6] max-w-[60ch]">
            Give every agent its own wallet, budget, and rules. When it hits a
            paid API, Warden checks the policy, signs only approved payments,
            and records the receipt.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-[auto_1px_auto] gap-x-7 gap-y-3 max-w-fit">
            <div>
              <span className="label text-t4">AGENT</span>
              <div className="mt-1 text-t1 text-[15.5px]">Gets spending power.</div>
            </div>
            <div className="hidden sm:block bg-hairline" />
            <div>
              <span className="label text-t4">OPERATOR</span>
              <div className="mt-1 text-t1 text-[15.5px]">Keeps authority.</div>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-5 flex-wrap">
            <a
              href={ctaHref}
              className="label px-6 py-3.5 border border-signal text-signal hover:bg-signal hover:text-bg-base transition-colors"
            >
              {ctaLabel} →
            </a>
            <a
              href="#flow"
              className="label px-6 py-3.5 border border-hairline-strong text-t2 hover:text-t1 hover:border-t3 transition-colors"
            >
              SEE THE FLOW
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
              AI agents are about to touch real money.
            </h2>
            <p className="mt-6 text-t2 text-[15.5px] leading-[1.65] max-w-[44ch]">
              x402 lets agents pay for APIs, data, compute, and services over
              HTTP.
            </p>
            <p className="mt-3 text-t3 text-[14.5px] leading-[1.65] max-w-[44ch]">
              That solves the payment problem.{" "}
              <span className="text-t1">It does not solve the authority problem.</span>
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
                  <span className="mono text-deny text-[12px] tabular">
                    0{i + 1} ✕
                  </span>
                  <span className="text-t2 text-[15.5px] leading-[1.5] line-through decoration-deny/60 decoration-1">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-t1 text-[15px]">
              None of that survives production.
            </p>
          </div>
        </div>
      </section>

      {/* FLOW */}
      <section id="flow" className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24">
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-8 border-b border-hairline">
            <span className="label text-t4">FLOW</span>
            <h2 className="text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Warden sits between the agent and the spend.
            </h2>
          </header>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-10 items-start">
            <div>
              <p className="text-t2 text-[18px] leading-[1.45]">The agent asks.</p>
              <p className="mt-1 text-t2 text-[18px] leading-[1.45]">Warden decides.</p>
              <p className="mt-1 text-t1 text-[18px] leading-[1.45]">
                Only approved payments get signed.
              </p>

              <div className="mt-10 border border-hairline-strong bg-bg-deep/60 p-7">
                <span className="label text-t4">OUTCOME GUARANTEES</span>
                <ul className="mt-5 flex flex-col divide-y divide-hairline/70">
                  {[
                    ["No policy", "no spend."],
                    ["No approval", "no signature."],
                    ["No hidden wallet access", "ever."],
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
              {FLOW_STEPS.map(([text, kind], i) => (
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

      {/* WALLETS */}
      <section id="wallets" className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-16 items-start">
          <div>
            <span className="label text-t4">WALLETS</span>
            <h2 className="mt-4 text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Built for agents.
              <br />
              <span className="text-signal">Controlled by operators.</span>
            </h2>
            <p className="mt-6 text-t2 text-[15.5px] leading-[1.65] max-w-[48ch]">
              Each agent gets a scoped wallet with its own balance, token,
              policy, and audit trail.
            </p>
            <p className="mt-4 text-t3 text-[14.5px] leading-[1.65] max-w-[48ch]">
              Agents can pay for what they are allowed to use. They cannot drain
              shared funds, bypass limits, or invent new authority at runtime.
            </p>

            <div className="mt-10">
              <WalletCard />
            </div>
          </div>

          <div className="border border-hairline-strong bg-bg-deep/60 p-7">
            <div className="flex items-baseline justify-between">
              <span className="label text-t4">USE WARDEN TO ENFORCE</span>
              <span className="mono text-t4 text-[10.5px]">{ENFORCE.length} CONTROLS</span>
            </div>
            <ul className="mt-5 grid grid-cols-1">
              {ENFORCE.map((item, i) => (
                <li
                  key={item}
                  className="grid grid-cols-[44px_1fr_28px] items-center py-3.5 border-b border-hairline/60 last:border-b-0"
                >
                  <span className="mono text-t4 text-[11px] tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-t1 text-[14.5px]">{item}</span>
                  <span className="mono text-allow text-[12px] justify-self-end">●</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* X402 */}
      <section className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24">
          <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-8 border-b border-hairline">
            <span className="label text-t4">x402</span>
            <h2 className="text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Payments with a hard stop.
            </h2>
            <span className="ml-auto mono text-t4 text-[10.5px]">
              full loop
            </span>
          </header>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-6 gap-px bg-hairline border border-hairline-strong">
            {X402_STEPS.map((step, i) => (
              <div
                key={step}
                className="bg-bg-deep p-6 flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="mono text-signal text-[11px] tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mono text-t4 text-[10.5px]">STEP</span>
                </div>
                <p className="text-t1 text-[14.5px] leading-[1.4] mt-6">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="border border-allow-dim/60 bg-bg-deep/60 px-6 py-5">
              <span className="mono text-allow text-[11px]">● APPROVED</span>
              <p className="mt-2 text-t1 text-[15px]">Payments settle.</p>
              <p className="mt-1 text-t3 text-[13px]">
                Proof attached. USDC moves on Solana.
              </p>
            </div>
            <div className="border border-deny-dim/60 bg-bg-deep/60 px-6 py-5">
              <span className="mono text-deny text-[11px]">● DENIED</span>
              <p className="mt-2 text-t1 text-[15px]">
                Payments stop before funds move.
              </p>
              <p className="mt-1 text-t3 text-[13px]">
                Receipt records the rule that fired.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* RECEIPTS */}
      <section className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24 grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-x-16 gap-y-10 items-start">
          <div>
            <span className="label text-t4">RECEIPTS</span>
            <h2 className="mt-4 text-[clamp(1.7rem,3vw,2.6rem)] tracking-[-0.03em] text-t1 font-medium leading-[1.08]">
              Receipts for every decision.
            </h2>
            <p className="mt-6 text-t2 text-[15.5px] leading-[1.65] max-w-[44ch]">
              Every payment attempt leaves a trail.
            </p>
            <p className="mt-4 text-t3 text-[14.5px] leading-[1.65] max-w-[44ch]">
              See what each agent tried to buy, what it cost, which policy
              fired, whether it was approved or denied, and what happened after
              settlement.
            </p>
            <p className="mt-6 text-t1 text-[15px] leading-[1.55] max-w-[44ch]">
              When an agent spends money, you should not have to reconstruct the
              story from logs.
            </p>
          </div>

          <ReceiptStrip />
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

              <span className="mt-8 inline-block label text-t4">AVAILABLE TOOLS</span>
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
                Works with{" "}
                <span className="text-t1">Codex</span>,{" "}
                <span className="text-t1">Claude</span>,{" "}
                <span className="text-t1">Cursor</span>, custom agents, and any
                runtime that can call MCP or HTTP.
              </p>
            </div>

            <div>
              <div className="border border-hairline-strong bg-bg-deep">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
                  <span className="mono text-t4 text-[10.5px]">
                    ~/.config/mcp.json
                  </span>
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

      {/* POSITIONING */}
      <section className="border-b border-hairline">
        <div className="max-w-[1240px] mx-auto px-8 py-24">
          <span className="label text-t4">POSITIONING</span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.4vw,3rem)] tracking-[-0.035em] text-t1 font-medium leading-[1.05] max-w-[22ch]">
            The control plane for money-moving agents.
          </h2>

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-x-16 gap-y-10">
            <ul className="flex flex-col">
              {NOT_THIS.map((line) => (
                <li
                  key={line}
                  className="grid grid-cols-[28px_1fr] items-baseline py-4 border-b border-hairline/60 last:border-b-0"
                >
                  <span className="mono text-deny text-[12px]">✕</span>
                  <span className="text-t2 text-[16px] line-through decoration-deny/50 decoration-1">
                    {line}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-l border-hairline pl-8">
              <span className="mono text-allow text-[11px]">● WHAT IT IS</span>
              <p className="mt-3 text-t1 text-[20px] leading-[1.4] max-w-[40ch]">
                Warden is the authority layer between autonomous software and
                real spend.
              </p>
              <div className="mt-8 grid grid-cols-2 max-w-[24rem]">
                <div className="border-r border-hairline pr-5">
                  <span className="label text-t4">AGENTS GET</span>
                  <p className="mt-2 text-t1 text-[18px]">Capability.</p>
                </div>
                <div className="pl-5">
                  <span className="label text-t4">YOU KEEP</span>
                  <p className="mt-2 text-signal text-[18px]">Control.</p>
                </div>
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
            <span className="text-t1">Give agents capability.</span>
            <br />
            <span className="text-signal">Keep control.</span>
          </h2>
          <div className="mt-12 flex items-center justify-center gap-5 flex-wrap">
            <a
              href={ctaHref}
              className="label px-7 py-4 border border-signal text-signal hover:bg-signal hover:text-bg-base transition-colors"
            >
              CREATE FIRST AGENT →
            </a>
            <a
              href="#flow"
              className="label px-7 py-4 border border-hairline-strong text-t2 hover:text-t1 hover:border-t3 transition-colors"
            >
              READ THE FLOW
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="max-w-[1240px] mx-auto px-8 py-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px]">
        <span className="mono text-signal">warden</span>
        <span className="mono text-t4">v0.1 · solana · x402 · mcp</span>
        <span className="mono text-t4 hidden sm:inline">
          ©{new Date().getFullYear()}
        </span>
        <a
          href={consoleHref}
          className="ml-auto label text-t4 hover:text-t1 transition-colors"
        >
          CONSOLE
        </a>
        <a
          href="/login"
          className="label text-t4 hover:text-t1 transition-colors"
        >
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
/* Hero diagram — single horizontal flow: agent → policy → wallet → x402 → log */
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
        aria-label="An agent request enters the policy gate, gets signed by the warden wallet, settles via x402, and emits a receipt."
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
          { x: 80, label: "AGENT", sub: "research-01" },
          { x: 280, label: "POLICY", sub: "v.04 · live" },
          { x: 480, label: "WALLET", sub: "warden-signer" },
          { x: 680, label: "x402", sub: "challenge → proof" },
          { x: 880, label: "PROVIDER", sub: "200 · settled" },
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
                fill={isLast ? "var(--allow)" : "var(--signal)"}
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
              {/* arrow into next */}
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
              {/* step number above */}
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

        {/* loopback label */}
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

/* -------------------------------------------------------------------------- */
/* Wallet card — concrete sample of a per-agent wallet                         */
/* -------------------------------------------------------------------------- */
function WalletCard() {
  return (
    <div className="border border-hairline-strong bg-bg-deep p-6">
      <div className="flex items-baseline justify-between">
        <span className="mono text-t4 text-[10.5px]">AGENT WALLET</span>
        <span className="mono text-allow text-[10.5px]">● ACTIVE</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-y-4 gap-x-6">
        <div>
          <span className="label text-t4">AGENT</span>
          <div className="mono text-t1 text-[13px] mt-1">research-01</div>
        </div>
        <div>
          <span className="label text-t4">PUBKEY</span>
          <div className="mono text-t1 text-[13px] mt-1">7sN4…aBcD</div>
        </div>
        <div>
          <span className="label text-t4">BALANCE</span>
          <div className="tabular text-t1 text-[15px] mt-1">12.40 USDC</div>
        </div>
        <div>
          <span className="label text-t4">BUDGET LEFT</span>
          <div className="tabular text-signal text-[15px] mt-1">3.85 / 5.00</div>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="label text-t4">DAILY USAGE</span>
          <span className="mono text-t4 text-[10.5px]">23%</span>
        </div>
        <div className="mt-2 h-1.5 bg-bg-row">
          <div className="h-full bg-signal" style={{ width: "23%" }} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Receipt strip — mock ledger of approve / deny rows                          */
/* -------------------------------------------------------------------------- */
function ReceiptStrip() {
  const rows = [
    {
      id: "rcpt_01J9X4…7K",
      time: "14:02:11",
      provider: "exa.ai/search",
      cost: "0.020",
      verdict: "allow",
      rule: "budget · 0.45/5.00",
    },
    {
      id: "rcpt_01J9X4…7L",
      time: "14:02:34",
      provider: "firecrawl.dev/scrape",
      cost: "0.050",
      verdict: "allow",
      rule: "provider · allowlist",
    },
    {
      id: "rcpt_01J9X4…7M",
      time: "14:03:02",
      provider: "unknown-rpc.xyz",
      cost: "0.250",
      verdict: "deny",
      rule: "provider · not allowed",
    },
    {
      id: "rcpt_01J9X4…7N",
      time: "14:03:18",
      provider: "deepl.com/translate",
      cost: "0.012",
      verdict: "allow",
      rule: "per-request · ok",
    },
    {
      id: "rcpt_01J9X4…7P",
      time: "14:03:41",
      provider: "openai.com/v1/audio",
      cost: "0.640",
      verdict: "deny",
      rule: "amount · over per-request cap",
    },
  ];

  return (
    <div className="border border-hairline-strong bg-bg-deep">
      <div className="grid grid-cols-[140px_84px_1fr_80px_76px_1fr] gap-3 px-5 py-3 border-b border-hairline">
        {["RECEIPT", "TIME", "PROVIDER", "USDC", "VERDICT", "RULE"].map((h) => (
          <span key={h} className="mono text-t4 text-[10px] tracking-[0.12em]">
            {h}
          </span>
        ))}
      </div>
      <ul>
        {rows.map((r) => {
          const allow = r.verdict === "allow";
          return (
            <li
              key={r.id}
              className="grid grid-cols-[140px_84px_1fr_80px_76px_1fr] gap-3 px-5 py-3 border-b border-hairline/60 last:border-b-0 items-center"
            >
              <span className="mono text-t2 text-[12px]">{r.id}</span>
              <span className="mono text-t3 text-[12px] tabular">{r.time}</span>
              <span className="text-t1 text-[13px] truncate">{r.provider}</span>
              <span className="tabular text-t1 text-[13px] text-right">
                {r.cost}
              </span>
              <span
                className={`mono text-[11px] tracking-[0.12em] uppercase ${
                  allow ? "text-allow" : "text-deny"
                }`}
              >
                ● {r.verdict}
              </span>
              <span className="mono text-t3 text-[11.5px] truncate">{r.rule}</span>
            </li>
          );
        })}
      </ul>
      <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
        <span className="mono text-t4 text-[10.5px]">APPEND-ONLY · WRITE-ONCE</span>
        <span className="mono text-t4 text-[10.5px]">
          5 ENTRIES · 2 DENIED
        </span>
      </div>
    </div>
  );
}
