"use client";

import { useActionState } from "react";
import { dryRunPolicy, type DryRunResult } from "./actions";

interface AgentOption {
  id: string;
  name: string;
}

export function DryRunForm({ agents }: { agents: AgentOption[] }) {
  const [state, formAction, pending] = useActionState<
    DryRunResult | { error: string } | undefined,
    FormData
  >(dryRunPolicy, undefined);

  return (
    <div className="grid grid-cols-[420px_1fr] divide-x divide-hairline">
      <form action={formAction} className="flex flex-col gap-4 p-8">
        <Field label="Agent">
          <select
            name="agentId"
            defaultValue={agents[0]?.id}
            className="w-full bg-bg-base border border-hairline-strong px-3 py-2 mono text-[12.5px] text-t1 outline-none"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.id}
              </option>
            ))}
          </select>
        </Field>
        <Field label="URL">
          <input
            name="url"
            placeholder="https://x402.example.com/data"
            className="w-full bg-bg-base border border-hairline-strong px-3 py-2 mono text-[12.5px] text-t1 outline-none"
          />
        </Field>
        <div>
          <Field label="Method">
            <select
              name="method"
              defaultValue="GET"
              className="w-full bg-bg-base border border-hairline-strong px-3 py-2 mono text-[12.5px] text-t1 outline-none"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="label px-4 py-2 border border-signal-dim text-signal hover:bg-signal hover:text-bg-base hover:border-signal disabled:opacity-50 transition-colors"
        >
          {pending ? "EVALUATING…" : "EVALUATE"}
        </button>
      </form>

      <div className="p-8">
        {!state ? (
          <p className="text-t3 text-[13px] max-w-[60ch]">
            Pick an agent and paste an endpoint. Warden will fetch the x402
            challenge, choose the first policy-compatible requirement, and
            report the decision without signing a payment or writing a receipt.
          </p>
        ) : "error" in state ? (
          <div className="flex items-center gap-2">
            <span className="mono text-deny">✕</span>
            <span className="text-deny text-[13px]">{state.error}</span>
          </div>
        ) : (
          <Result {...state} />
        )}
      </div>
    </div>
  );
}

function Result(props: DryRunResult) {
  const { decision, agentName, amountUsd, todayUsd } = props;
  const tone =
    decision.kind === "allow"
      ? "text-allow"
      : decision.kind === "deny"
      ? "text-deny"
      : decision.kind === "requires_approval"
      ? "text-pending"
      : "text-t3";
  const glyph =
    decision.kind === "allow"
      ? "●"
      : decision.kind === "deny"
      ? "✕"
      : decision.kind === "requires_approval"
      ? "◐"
      : "○";
  const label =
    decision.kind === "allow"
      ? "ALLOW"
      : decision.kind === "deny"
      ? "DENY"
      : decision.kind === "requires_approval"
      ? "REQUIRES APPROVAL"
      : "NO PAYMENT REQUIRED";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className={`mono text-[24px] ${tone}`}>{glyph}</span>
        <span className={`label text-[13px] ${tone}`}>{label}</span>
      </div>
      <Row label="AGENT" value={agentName} />
      <Row
        label={decision.kind === "no_payment_required" ? "HTTP STATUS" : "REQUEST AMOUNT"}
        value={
          decision.kind === "no_payment_required"
            ? String(decision.status)
            : `$${amountUsd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
        }
      />
      {props.network && <Row label="NETWORK" value={props.network} mono />}
      {props.token && <Row label="TOKEN" value={props.token} mono />}
      <Row
        label="ALREADY SPENT TODAY"
        value={`$${todayUsd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
      />
      {"rule" in decision && (
        <Row label="RULE" value={decision.rule} mono />
      )}
      {"reason" in decision && (
        <Row label="REASON" value={decision.reason} />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <span className={`text-t1 text-[13px] ${mono ? "mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
